import { createServer, type Server } from "node:http";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import * as client from "openid-client";
import { afterEach, describe, expect, it } from "vitest";
import type { Session, SessionRepository } from "../repositories/session.repository.js";
import { LOGIN_COOKIE, authRoutes } from "./auth.routes.js";

const ORIGIN = "http://localhost:5173";
const SECRET = "test-secret";

const oidc = new client.Configuration(
  {
    issuer: "http://localhost:5173/realms/test",
    authorization_endpoint: "http://localhost:5173/realms/test/auth",
    token_endpoint: "http://127.0.0.1:1/token",
  },
  "stock-bff",
  "secret",
);
// The test endpoints are plain http.
client.allowInsecureRequests(oidc);

/** Counts what the callback creates; the grant never reaches it in these tests. */
function fakeSessions() {
  const state = { created: 0, stored: new Map<string, Session>(), fail: false, deleted: [] as string[] };
  const repo: Pick<SessionRepository, "create" | "delete" | "get"> = {
    get: async (id) => {
      if (state.fail) throw new Error("redis down");
      return state.stored.get(id);
    },
    create: async () => {
      state.created += 1;
      return "id";
    },
    delete: async (id) => {
      state.deleted.push(id);
      state.stored.delete(id);
    },
  };
  const tokens = {
    getSession: async (id: string) => {
      if (state.fail) throw new Error("redis down");
      return state.stored.get(id);
    },
  };
  return { repo, tokens, state };
}

async function build(): Promise<{ app: FastifyInstance; sessions: ReturnType<typeof fakeSessions> }> {
  const app = Fastify();
  await app.register(cookie, { secret: SECRET });
  const sessions = fakeSessions();
  await app.register(authRoutes, { oidc, publicOrigin: ORIGIN, production: false, sessions: sessions.repo, tokens: sessions.tokens });
  return { app, sessions };
}

/** Runs /bff/login and returns the login cookie it set and the state it sent to Keycloak. */
async function startLogin(app: FastifyInstance, returnTo: string): Promise<{ cookie: string; state: string }> {
  const res = await app.inject({ method: "GET", url: `/bff/login?returnTo=${encodeURIComponent(returnTo)}` });
  const setCookie = res.cookies.find((c) => c.name === LOGIN_COOKIE);
  const location = res.headers.location;
  if (!setCookie || typeof location !== "string") throw new Error(`login did not redirect: ${res.statusCode} ${res.body}`);
  const state = new URL(location).searchParams.get("state");
  if (state === null) throw new Error("no state");
  return { cookie: `${LOGIN_COOKIE}=${setCookie.value}`, state };
}

describe("GET /bff/callback", () => {
  it("rejects a request without the login cookie", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/bff/callback?code=c&state=s" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "LOGIN_EXPIRED" });
  });

  it("rejects a login cookie with a bad signature", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "GET",
      url: "/bff/callback?code=c&state=s",
      headers: { cookie: `${LOGIN_COOKIE}=e30.forged` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a state that differs from the cookie, and clears the cookie", async () => {
    const { app, sessions } = await build();
    const login = await startLogin(app, "/settings");
    const res = await app.inject({
      method: "GET",
      url: "/bff/callback?code=c&state=other",
      headers: { cookie: login.cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "STATE_MISMATCH" });
    expect(res.cookies.find((c) => c.name === LOGIN_COOKIE)?.value).toBe("");
    expect(sessions.state.created).toBe(0);
  });

  it("sends a Keycloak error back to returnTo without creating a session", async () => {
    const { app, sessions } = await build();
    const login = await startLogin(app, "/settings");
    const res = await app.inject({
      method: "GET",
      url: `/bff/callback?error=access_denied&state=${login.state}`,
      headers: { cookie: login.cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/settings");
    expect(sessions.state.created).toBe(0);
    expect(res.cookies.find((c) => c.name === "session")).toBeUndefined();
  });

  it("keeps a hostile returnTo out of the redirect", async () => {
    const { app } = await build();
    const login = await startLogin(app, "//evil.com");
    const res = await app.inject({
      method: "GET",
      url: `/bff/callback?error=access_denied&state=${login.state}`,
      headers: { cookie: login.cookie },
    });
    expect(res.headers.location).toBe("/");
  });

  it("answers 503 when the token endpoint cannot be reached", async () => {
    const { app, sessions } = await build();
    const login = await startLogin(app, "/");
    const res = await app.inject({
      method: "GET",
      url: `/bff/callback?code=c&state=${login.state}`,
      headers: { cookie: login.cookie },
    });
    expect(res.statusCode).toBe(503);
    expect(sessions.state.created).toBe(0);
  });
});

describe("GET /bff/me", () => {
  const session: Session = {
    sub: "user-1",
    sid: "sid-1",
    name: "Ada",
    email: "ada@example.com",
    accessToken: "access-secret",
    accessExpiresAt: 0,
    refreshToken: "refresh-secret",
    refreshExpiresAt: 0,
    idToken: "id-secret",
  };

  it("answers 401 without a session cookie", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/bff/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("answers 401 for an unknown session id", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/bff/me", headers: { cookie: "session=nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("returns the user and no tokens", async () => {
    const { app, sessions } = await build();
    sessions.state.stored.set("abc", session);
    const res = await app.inject({ method: "GET", url: "/bff/me", headers: { cookie: "session=abc" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: "user-1", name: "Ada", email: "ada@example.com" } });
    expect(res.body).not.toContain("secret");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 503 when the session store fails", async () => {
    const { app, sessions } = await build();
    sessions.state.fail = true;
    const res = await app.inject({ method: "GET", url: "/bff/me", headers: { cookie: "session=abc" } });
    expect(res.statusCode).toBe(503);
  });
});

describe("POST /bff/logout", () => {
  const session: Session = {
    sub: "user-1",
    sid: "sid-1",
    name: "Ada",
    email: "ada@example.com",
    accessToken: "access-secret",
    accessExpiresAt: 0,
    refreshToken: "refresh-secret",
    refreshExpiresAt: 0,
    idToken: "id-secret",
  };
  const headers = { cookie: "session=abc", "x-requested-with": "fetch" };

  function endSessionUrl(body: unknown): string {
    if (typeof body === "object" && body !== null && "endSessionUrl" in body && typeof body.endSessionUrl === "string") {
      return body.endSessionUrl;
    }
    throw new Error("no endSessionUrl in the body");
  }

  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  /** A Keycloak whose revocation endpoint records its calls (or fails). */
  async function buildWithKeycloak(status: number) {
    const bodies: string[] = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        bodies.push(body);
        res.statusCode = status;
        res.end(status === 200 ? "" : JSON.stringify({ error: "server_error" }));
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const port = address.port;
    const config = new client.Configuration(
      {
        issuer: "http://localhost:5173/realms/test",
        authorization_endpoint: "http://localhost:5173/realms/test/auth",
        end_session_endpoint: "http://localhost:5173/realms/test/logout",
        revocation_endpoint: `http://127.0.0.1:${port}/revoke`,
        token_endpoint: `http://127.0.0.1:${port}/token`,
      },
      "stock-bff",
      "secret",
    );
    client.allowInsecureRequests(config);

    const app = Fastify();
    await app.register(cookie, { secret: SECRET });
    const sessions = fakeSessions();
    sessions.state.stored.set("abc", session);
    await app.register(authRoutes, { oidc: config, publicOrigin: ORIGIN, production: false, sessions: sessions.repo, tokens: sessions.tokens });
    return { app, sessions, bodies };
  }

  it("rejects a request without X-Requested-With", async () => {
    const { app, sessions, bodies } = await buildWithKeycloak(200);
    const res = await app.inject({ method: "POST", url: "/bff/logout", headers: { cookie: "session=abc" } });
    expect(res.statusCode).toBe(403);
    expect(sessions.state.deleted).toEqual([]);
    expect(bodies).toEqual([]);
  });

  it("deletes the session, revokes the refresh token, clears the cookie and returns the end-session URL", async () => {
    const { app, sessions, bodies } = await buildWithKeycloak(200);
    const res = await app.inject({ method: "POST", url: "/bff/logout", headers });
    expect(res.statusCode).toBe(200);

    const url = new URL(endSessionUrl(res.json()));
    expect(url.origin + url.pathname).toBe("http://localhost:5173/realms/test/logout");
    expect(url.searchParams.get("id_token_hint")).toBe("id-secret");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`${ORIGIN}/`);

    expect(sessions.state.deleted).toEqual(["abc"]);
    expect(bodies).toHaveLength(1);
    expect(new URLSearchParams(bodies[0]).get("token")).toBe("refresh-secret");
    const cleared = res.cookies.find((c) => c.name === "session");
    expect(cleared?.value).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).not.toContain("refresh-secret");
  });

  it("still logs out when Keycloak refuses the revocation", async () => {
    const { app, sessions } = await buildWithKeycloak(500);
    const res = await app.inject({ method: "POST", url: "/bff/logout", headers });
    expect(res.statusCode).toBe(200);
    expect(endSessionUrl(res.json())).toContain("id_token_hint=id-secret");
    expect(sessions.state.deleted).toEqual(["abc"]);
  });

  it("answers with no URL when there is no session", async () => {
    const { app, bodies } = await buildWithKeycloak(200);
    const none = await app.inject({ method: "POST", url: "/bff/logout", headers: { "x-requested-with": "fetch" } });
    expect(none.json()).toEqual({ endSessionUrl: null });
    const unknown = await app.inject({ method: "POST", url: "/bff/logout", headers: { cookie: "session=nope", "x-requested-with": "fetch" } });
    expect(unknown.json()).toEqual({ endSessionUrl: null });
    expect(bodies).toEqual([]);
  });

  it("answers 503 and keeps the cookie when the session store fails", async () => {
    const { app, sessions } = await buildWithKeycloak(200);
    sessions.state.fail = true;
    const res = await app.inject({ method: "POST", url: "/bff/logout", headers });
    expect(res.statusCode).toBe(503);
    expect(res.cookies.find((c) => c.name === "session")).toBeUndefined();
  });
});
