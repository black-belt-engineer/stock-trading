import { describe, expect, it, vi } from "vitest";
import { createSession, type Credentials, type RefreshOutcome } from "./session";
import { connectTabs, proactiveDelayMs, withRefreshLock, type TabChannel } from "./tabSync";

const USER = { id: "u1", email: "ada@example.com", name: "Ada" };
const creds = (accessToken: string): Credentials => ({ accessToken, expiresIn: 600, user: USER });

/** Channels joined like one BroadcastChannel name: a post reaches every other tab, not the sender. */
function network(): () => TabChannel & { posted: unknown[] } {
  const listeners: Array<{ owner: object; listener: Parameters<TabChannel["subscribe"]>[0] }> = [];
  return () => {
    const owner = {};
    const posted: unknown[] = [];
    return {
      posted,
      post: (message) => {
        posted.push(message);
        for (const entry of listeners) if (entry.owner !== owner) entry.listener(message);
      },
      subscribe: (listener) => {
        listeners.push({ owner, listener });
      },
    };
  };
}

describe("proactiveDelayMs", () => {
  it("refreshes 60 s before a normal token runs out", () => {
    expect(proactiveDelayMs(600)).toBe(540_000);
  });

  it("refreshes a short token at half its life, never at once", () => {
    expect(proactiveDelayMs(20)).toBe(10_000);
    expect(proactiveDelayMs(0)).toBe(1_000);
  });
});

describe("withRefreshLock", () => {
  it("uses credentials another tab broadcast while this one waited on the lock, without refreshing", async () => {
    // Node has the Web Locks API, so both "tabs" really queue on one lock here.
    expect(typeof navigator.locks.request).toBe("function");
    const join = network();
    const a = join();
    const b = join();
    let release: (outcome: RefreshOutcome) => void = () => {};
    const refreshA = vi.fn(
      () =>
        new Promise<RefreshOutcome>((resolve) => {
          release = resolve;
        }),
    );
    const refreshB = vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "ok", ...creds("b-own") }));
    const lockedA = withRefreshLock(refreshA, a);
    const lockedB = withRefreshLock(refreshB, b);

    const pendingA = lockedA();
    await vi.waitFor(() => expect(refreshA).toHaveBeenCalledTimes(1)); // A holds the lock
    const pendingB = lockedB(); // B queues behind it
    release({ kind: "ok", ...creds("from-a") });

    await expect(pendingA).resolves.toEqual({ kind: "ok", ...creds("from-a") });
    await expect(pendingB).resolves.toEqual({ kind: "ok", ...creds("from-a") });
    expect(refreshB).not.toHaveBeenCalled();
    expect(b.posted).toEqual([]);
  });

  it("refreshes again when the other tab's refresh was refused", async () => {
    const join = network();
    const [a, b] = [join(), join()];
    const refreshB = vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "unauthorized" }));
    await withRefreshLock(async () => ({ kind: "unauthorized" }), a)();
    await withRefreshLock(refreshB, b)();
    expect(refreshB).toHaveBeenCalledTimes(1);
  });

  it("refreshes when nothing arrived, and posts the result", async () => {
    const channel = network()();
    const refresh = vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "ok", ...creds("fresh") }));
    const outcome = await withRefreshLock(refresh, channel)();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "ok", ...creds("fresh") });
    expect(channel.posted).toEqual([{ type: "credentials", credentials: creds("fresh") }]);
  });

  it("posts nothing when the refresh is refused", async () => {
    const channel = network()();
    await withRefreshLock(async () => ({ kind: "unauthorized" }), channel)();
    expect(channel.posted).toEqual([]);
  });
});

describe("connectTabs", () => {
  it("logs every tab out when one logs out, without echoing it back", () => {
    const join = network();
    const [ca, cb] = [join(), join()];
    const a = createSession(async () => ({ kind: "unauthorized" }));
    const b = createSession(async () => ({ kind: "unauthorized" }));
    connectTabs(a, ca);
    connectTabs(b, cb);
    a.setCredentials(creds("t"));
    expect(b.getAccessToken()).toBe("t");
    expect(b.getUser()).toEqual(USER);

    const seenByB = vi.fn();
    b.onLoggedOut(seenByB);
    a.logOut();
    expect(b.getAccessToken()).toBeNull();
    expect(seenByB).toHaveBeenCalledWith("remote");
    expect(ca.posted).toEqual([{ type: "credentials", credentials: creds("t") }, { type: "logout" }]);
    expect(cb.posted).toEqual([]);
  });
});
