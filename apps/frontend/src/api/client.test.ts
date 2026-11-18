import { describe, expect, it, vi } from "vitest";
import { createApiClient, LoggedOutError } from "./client";

function respond(status: number): typeof fetch {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response("{}", { status })));
}

describe("createApiClient", () => {
  it("sends the cookie and X-Requested-With, and keeps the caller's headers", async () => {
    const fetchImpl = respond(200);
    const apiFetch = createApiClient(() => {}, fetchImpl);

    await apiFetch("/quotes/AAPL/snapshot", { headers: { Accept: "text/event-stream" }, method: "POST" });

    const [path, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(path).toBe("/quotes/AAPL/snapshot");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Requested-With")).toBe("fetch");
    expect(headers.get("Accept")).toBe("text/event-stream");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("returns the response for any status but 401", async () => {
    const onLoggedOut = vi.fn();
    for (const status of [200, 403, 404, 502, 503]) {
      const apiFetch = createApiClient(onLoggedOut, respond(status));
      expect((await apiFetch("/quotes/x")).status).toBe(status);
    }
    expect(onLoggedOut).not.toHaveBeenCalled();
  });

  it("reports a 401 as a logout, once per call, without retrying", async () => {
    const fetchImpl = respond(401);
    const onLoggedOut = vi.fn();
    const apiFetch = createApiClient(onLoggedOut, fetchImpl);

    await expect(apiFetch("/quotes/x")).rejects.toBeInstanceOf(LoggedOutError);

    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes a network error on without reporting a logout", async () => {
    const onLoggedOut = vi.fn();
    const apiFetch = createApiClient(onLoggedOut, () => Promise.reject(new TypeError("Failed to fetch")));

    await expect(apiFetch("/quotes/x")).rejects.toBeInstanceOf(TypeError);
    expect(onLoggedOut).not.toHaveBeenCalled();
  });
});
