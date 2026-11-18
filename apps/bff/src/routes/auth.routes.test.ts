import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import * as client from "openid-client";
import { describe, expect, it } from "vitest";
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
  const state = { created: 0, stored: new Map<string, Session>(), fail: false };
  const repo: Pick<SessionRepository, "create" | "delete"> = {
    create: async () => {
      state.created += 1;
      return "id";
    },
    delete: async () => undefined,
    get: async (id) => {
      if (state.fail) throw new Error("redis down");
      return state.stored.get(id);
    },
  };
  return { repo, state };
}

async function build(): Promise<{ app: FastifyInstance; sessions: ReturnType<typeof fakeSessions> }> {
  const app = Fastify();
  await app.register(cookie, { secret: SECRET });
  const sessions = fakeSessions();
  await app.register(authRoutes, { oidc, publicOrigin: ORIGIN, production: false, sessions: sessions.repo });
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
