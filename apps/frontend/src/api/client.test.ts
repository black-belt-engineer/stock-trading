import { describe, expect, it, vi } from "vitest";
import { createSession, type RefreshOutcome } from "../auth/session";
import { createApiClient, AuthUnavailableError, LoggedOutError } from "./client";

const USER = { id: "u1", email: "ada@example.com", name: "Ada" };

/** A promise with its resolver, to hold a refresh open while requests pile up. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A fake server: `valid` is the token it accepts; `status` overrides the answer. */
function setup(options: { valid?: string; status?: number; refresh?: () => Promise<RefreshOutcome> } = {}) {
  const refresh = vi.fn(options.refresh ?? (async (): Promise<RefreshOutcome> => ({ kind: "ok", accessToken: "new", expiresIn: 600, user: USER })));
  const session = createSession(refresh);
  const seen: Array<string | null> = [];
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const auth = new Headers(init?.headers).get("Authorization");
    seen.push(auth);
    if (options.status !== undefined) return new Response(null, { status: options.status });
    return new Response(null, { status: auth === `Bearer ${options.valid ?? "new"}` ? 200 : 401 });
  });
  const apiFetch = createApiClient(session, fetchImpl);
  return { session, refresh, fetchImpl, apiFetch, seen };
}

describe("createApiClient", () => {
  it("attaches the access token", async () => {
    const { session, apiFetch, seen, refresh } = setup({ valid: "good" });
    session.setAccessToken("good");
    const response = await apiFetch("/quotes/x");
    expect(response.status).toBe(200);
    expect(seen).toEqual(["Bearer good"]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shares one refresh between parallel 401s and retries each with the new token", async () => {
    const gate = deferred<RefreshOutcome>();
    const { session, apiFetch, refresh } = setup({ refresh: () => gate.promise });
    session.setAccessToken("old");
    const requests = Promise.all([apiFetch("/a"), apiFetch("/b"), apiFetch("/c"), apiFetch("/d")]);
    // Let all four reach the refresh before it answers.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    gate.resolve({ kind: "ok", accessToken: "new", expiresIn: 600, user: USER });
    const responses = await requests;
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe("new");
  });

  it("does not refresh again for a 401 on a token that was already replaced", async () => {
    const { session, apiFetch, refresh } = setup();
    session.setAccessToken("old");
    await apiFetch("/a");
    expect(refresh).toHaveBeenCalledTimes(1);
    // A request sent with "old" earlier comes back 401 after the refresh has finished.
    await expect(session.renew("old")).resolves.toBe("ok");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([403, 503])("never refreshes on %i and returns the response unchanged", async (status) => {
    const { session, apiFetch, refresh, fetchImpl } = setup({ status });
    const onLoggedOut = vi.fn();
    session.onLoggedOut(onLoggedOut);
    session.setAccessToken("token");
    const response = await apiFetch("/users/me");
    expect(response.status).toBe(status);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBe("token");
  });

  it("logs out when a fresh token is still refused", async () => {
    const { session, apiFetch, refresh } = setup({ valid: "never" });
    const onLoggedOut = vi.fn();
    session.onLoggedOut(onLoggedOut);
    session.setAccessToken("old");
    await expect(apiFetch("/a")).rejects.toBeInstanceOf(LoggedOutError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBeNull();
  });

  it("logs out when the refresh is refused", async () => {
    const { session, apiFetch, fetchImpl } = setup({ refresh: async () => ({ kind: "unauthorized" }) });
    const onLoggedOut = vi.fn();
    session.onLoggedOut(onLoggedOut);
    await expect(apiFetch("/a")).rejects.toBeInstanceOf(LoggedOutError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the auth service is unavailable", async () => {
    const { session, apiFetch } = setup({ refresh: async () => ({ kind: "unavailable" }) });
    const onLoggedOut = vi.fn();
    session.onLoggedOut(onLoggedOut);
    session.setAccessToken("old");
    await expect(apiFetch("/a")).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBe("old");
  });

  it("treats a refresh that throws as unavailable", async () => {
    const { apiFetch } = setup({ refresh: () => Promise.reject(new Error("network")) });
    await expect(apiFetch("/a")).rejects.toBeInstanceOf(AuthUnavailableError);
  });

  it("starts a new refresh once the previous one has finished", async () => {
    const { session, refresh } = setup();
    await session.renew(null);
    session.setAccessToken("expired-again");
    await session.renew("expired-again");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
