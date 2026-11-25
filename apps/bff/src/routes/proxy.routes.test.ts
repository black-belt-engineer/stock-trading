import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "../repositories/session.repository.js";
import { proxyRoutes } from "./proxy.routes.js";

const session: Session = {
  sub: "u1",
  sid: "s1",
  name: "Ann",
  email: "ann@example.com",
  accessToken: "access-1",
  accessExpiresAt: Date.now() + 600_000,
  refreshToken: "refresh-1",
  refreshExpiresAt: Date.now() + 3_600_000,
  idToken: "id-1",
};

type Seen = { method: string; url: string; headers: IncomingMessage["headers"]; body: string };

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      resolve(address ? address.port : 0);
    });
  });
}

/** An upstream that records what it got and streams events on `/stream`. */
async function startUpstream() {
  const seen: Seen[] = [];
  const state = { streamClosed: false, streamEnd: undefined as (() => void) | undefined };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (req.url?.startsWith("/stream")) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.write("event: price\ndata: 1\n\n");
        res.on("close", () => {
          state.streamClosed = true;
        });
        state.streamEnd = () => res.end("event: session-expired\ndata:\n\n");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const port = await listen(server);
  closers.push(() => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { url: `http://127.0.0.1:${port}`, seen, state };
}

async function startBff(upstream: string, getSession: (id: string) => Promise<Session | undefined>) {
  const app: FastifyInstance = Fastify();
  await app.register(cookie);
  await app.register(proxyRoutes, { upstream, paths: ["/quotes/*", "/stream"], production: false, tokens: { getSession } });
  const port = await listen(app.server);
  await app.ready();
  closers.push(() => app.close());
  return { app, url: `http://127.0.0.1:${port}` };
}

const known = async (id: string) => (id === "good" ? session : undefined);

describe("proxy routes", () => {
  it("forwards a read with the bearer token and without the cookie", async () => {
    const up = await startUpstream();
    const { app } = await startBff(up.url, known);
    const res = await app.inject({
      method: "GET",
      url: "/quotes/AAPL/snapshot?x=1",
      headers: { cookie: "session=good; other=1", authorization: "Bearer forged" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const got = up.seen[0];
    expect(got?.url).toBe("/quotes/AAPL/snapshot?x=1");
    expect(got?.headers.authorization).toBe("Bearer access-1");
    expect(got?.headers.cookie).toBeUndefined();
  });

  it("answers 401 without a cookie or for an unknown session, and calls nothing", async () => {
    const up = await startUpstream();
    const { app } = await startBff(up.url, known);
    expect((await app.inject({ method: "GET", url: "/quotes/x" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/stream", headers: { cookie: "session=nope" } })).statusCode).toBe(401);
    expect(up.seen).toHaveLength(0);
  });

  it("answers 503 when the session store or Keycloak fails", async () => {
    const up = await startUpstream();
    const { app } = await startBff(up.url, async () => { throw new Error("redis down"); });
    const res = await app.inject({ method: "GET", url: "/quotes/x", headers: { cookie: "session=good" } });
    expect(res.statusCode).toBe(503);
    expect(up.seen).toHaveLength(0);
  });

  it("requires X-Requested-With: fetch on non-GET requests", async () => {
    const up = await startUpstream();
    const { app } = await startBff(up.url, known);
    const headers = { cookie: "session=good", "content-type": "application/json" };
    const refused = await app.inject({ method: "POST", url: "/quotes/x", headers, payload: "{}" });
    expect(refused.statusCode).toBe(403);
    expect(up.seen).toHaveLength(0);

    const ok = await app.inject({ method: "POST", url: "/quotes/x", headers: { ...headers, "x-requested-with": "fetch" }, payload: '{"a":1}' });
    expect(ok.statusCode).toBe(200);
    expect(up.seen[0]?.method).toBe("POST");
    expect(up.seen[0]?.body).toBe('{"a":1}');
  });

  it("answers 502 when the service is down", async () => {
    const { app } = await startBff("http://127.0.0.1:1", known);
    const res = await app.inject({ method: "GET", url: "/quotes/x", headers: { cookie: "session=good" } });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("sends each service its own paths when registered once per service", async () => {
    const sse = await startUpstream();
    const portfolio = await startUpstream();
    const app: FastifyInstance = Fastify();
    await app.register(cookie);
    const tokens = { getSession: known };
    await app.register(proxyRoutes, { upstream: sse.url, paths: ["/quotes/*", "/stream"], production: false, tokens });
    await app.register(proxyRoutes, { upstream: portfolio.url, paths: ["/portfolio/*"], production: false, tokens });
    await app.ready();
    closers.push(() => app.close());

    const headers = { cookie: "session=good", "content-type": "application/json", "x-requested-with": "fetch" };
    const put = await app.inject({ method: "PUT", url: "/portfolio/watchlist/order", headers, payload: '{"symbols":["KO"]}' });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/quotes/x", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/portfolio", headers })).statusCode).toBe(404);

    expect(portfolio.seen.map((s) => `${s.method} ${s.url} ${s.body}`)).toEqual(['PUT /portfolio/watchlist/order {"symbols":["KO"]}']);
    expect(portfolio.seen[0]?.headers.authorization).toBe("Bearer access-1");
    expect(sse.seen.map((s) => s.url)).toEqual(["/quotes/x"]);
  });

  it("does not proxy other paths", async () => {
    const up = await startUpstream();
    const { app } = await startBff(up.url, known);
    expect((await app.inject({ method: "GET", url: "/other", headers: { cookie: "session=good" } })).statusCode).toBe(404);
  });

  it("streams unbuffered, ends with the upstream, and stops upstream when the browser leaves", async () => {
    const up = await startUpstream();
    const bff = await startBff(up.url, known);

    // First event arrives while the upstream response is still open.
    const first = await new Promise<{ res: IncomingMessage; text: string }>((resolve, reject) => {
      const req = httpRequest(`${bff.url}/stream?symbols=AAPL`, { headers: { cookie: "session=good" } }, (res) => {
        res.once("data", (chunk: Buffer) => resolve({ res, text: chunk.toString() }));
      });
      req.on("error", reject);
      req.end();
    });
    expect(first.res.headers["content-type"]).toBe("text/event-stream");
    expect(first.text).toContain("event: price");
    expect(up.seen[0]?.headers.authorization).toBe("Bearer access-1");

    // The upstream ends the stream: the browser side ends too.
    const rest = new Promise<string>((resolve) => {
      let text = "";
      first.res.on("data", (c: Buffer) => { text += c.toString(); });
      first.res.on("end", () => resolve(text));
    });
    up.state.streamEnd?.();
    expect(await rest).toContain("session-expired");

    // A second stream: the browser leaves, the upstream connection closes.
    const second = await new Promise<{ destroy: () => void }>((resolve, reject) => {
      const req = httpRequest(`${bff.url}/stream`, { headers: { cookie: "session=good" } }, (res) => {
        res.once("data", () => resolve({ destroy: () => req.destroy() }));
      });
      req.on("error", () => undefined);
      req.on("error", reject);
      req.end();
    });
    up.state.streamClosed = false;
    second.destroy();
    await new Promise((r) => setTimeout(r, 300));
    expect(up.state.streamClosed).toBe(true);
  });
});
