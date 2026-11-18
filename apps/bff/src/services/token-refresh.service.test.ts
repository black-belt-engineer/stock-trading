import { createServer, type Server } from "node:http";
import * as client from "openid-client";
import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "../repositories/session.repository.js";
import { IdentityProviderUnavailableError } from "./callback.service.js";
import { REFRESH_WINDOW_MS, TokenRefresher, refreshedSession } from "./token-refresh.service.js";

const NOW = 1_000_000_000_000;

function session(over: Partial<Session> = {}): Session {
  return {
    sub: "u1",
    sid: "s1",
    name: "Ann",
    email: "ann@example.com",
    accessToken: "old-access",
    accessExpiresAt: NOW + 10_000,
    refreshToken: "old-refresh",
    refreshExpiresAt: NOW + 3_600_000,
    idToken: "old-id",
    ...over,
  };
}

function fakeStore(initial: Session | undefined) {
  const state = { current: initial, saves: 0, deletes: 0 };
  return {
    state,
    store: {
      get: async () => state.current,
      save: async (_id: string, s: Session) => {
        state.saves += 1;
        state.current = s;
      },
      delete: async () => {
        state.deletes += 1;
        state.current = undefined;
      },
    },
  };
}

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

/** A token endpoint that answers with `reply` and counts its calls. */
async function tokenEndpoint(reply: { status: number; body: unknown }, delayMs = 0) {
  const calls = { count: 0 };
  server = createServer((_req, res) => {
    calls.count += 1;
    setTimeout(() => {
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    }, delayMs);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const { port } = address;
  const config = new client.Configuration(
    { issuer: "http://x", token_endpoint: `http://127.0.0.1:${port}/token` },
    "stock-bff",
    "secret",
  );
  client.allowInsecureRequests(config);
  return { config, calls };
}

const ok = { status: 200, body: { access_token: "new-access", token_type: "Bearer", expires_in: 600, refresh_token: "new-refresh", refresh_expires_in: 1800 } };

describe("TokenRefresher.getSession", () => {
  it("returns undefined without a session", async () => {
    const { config } = await tokenEndpoint(ok);
    const { store } = fakeStore(undefined);
    expect(await new TokenRefresher(config, store, () => NOW).getSession("id")).toBeUndefined();
  });

  it("does not call Keycloak while the token has more than the window left", async () => {
    const { config, calls } = await tokenEndpoint(ok);
    const { store, state } = fakeStore(session({ accessExpiresAt: NOW + REFRESH_WINDOW_MS + 1 }));
    const result = await new TokenRefresher(config, store, () => NOW).getSession("id");
    expect(result?.accessToken).toBe("old-access");
    expect(calls.count).toBe(0);
    expect(state.saves).toBe(0);
  });

  it("refreshes within the window and saves the new tokens", async () => {
    const { config, calls } = await tokenEndpoint(ok);
    const { store, state } = fakeStore(session());
    const result = await new TokenRefresher(config, store, () => NOW).getSession("id");
    expect(calls.count).toBe(1);
    expect(result).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", accessExpiresAt: NOW + 600_000 });
    expect(state.current?.accessToken).toBe("new-access");
  });

  it("shares one request between concurrent callers of the same session", async () => {
    const { config, calls } = await tokenEndpoint(ok, 50);
    const { store, state } = fakeStore(session());
    const refresher = new TokenRefresher(config, store, () => NOW);
    const results = await Promise.all([refresher.getSession("id"), refresher.getSession("id"), refresher.getSession("id")]);
    expect(calls.count).toBe(1);
    expect(state.saves).toBe(1);
    expect(results.every((r) => r?.accessToken === "new-access")).toBe(true);
  });

  it("deletes the session when Keycloak refuses the refresh token", async () => {
    const { config } = await tokenEndpoint({ status: 400, body: { error: "invalid_grant" } });
    const { store, state } = fakeStore(session());
    expect(await new TokenRefresher(config, store, () => NOW).getSession("id")).toBeUndefined();
    expect(state.deletes).toBe(1);
  });

  it("deletes a session whose refresh token has expired, without calling Keycloak", async () => {
    const { config, calls } = await tokenEndpoint(ok);
    const { store, state } = fakeStore(session({ refreshExpiresAt: NOW - 1 }));
    expect(await new TokenRefresher(config, store, () => NOW).getSession("id")).toBeUndefined();
    expect(calls.count).toBe(0);
    expect(state.deletes).toBe(1);
  });

  it("keeps a still-valid token when Keycloak is down", async () => {
    const { config } = await tokenEndpoint(ok);
    server?.close();
    const { store, state } = fakeStore(session());
    const result = await new TokenRefresher(config, store, () => NOW).getSession("id");
    expect(result?.accessToken).toBe("old-access");
    expect(state.deletes).toBe(0);
  });

  it("throws unavailable when Keycloak is down and the token has expired", async () => {
    const { config } = await tokenEndpoint(ok);
    server?.close();
    const { store, state } = fakeStore(session({ accessExpiresAt: NOW - 1 }));
    await expect(new TokenRefresher(config, store, () => NOW).getSession("id")).rejects.toBeInstanceOf(
      IdentityProviderUnavailableError,
    );
    expect(state.deletes).toBe(0);
  });
});

describe("refreshedSession", () => {
  it("keeps the stored refresh and ID tokens when the response has none", () => {
    const result = refreshedSession(session(), { access_token: "a", token_type: "bearer", expires_in: 60 }, undefined, NOW);
    expect(result).toMatchObject({ refreshToken: "old-refresh", idToken: "old-id", refreshExpiresAt: NOW + 3_600_000, name: "Ann" });
  });
});
