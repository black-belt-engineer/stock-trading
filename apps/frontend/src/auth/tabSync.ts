import { isRecord } from "../utils/guards";
import { parseCredentials, parseUser } from "./credentials";
import type { AuthUser, Credentials, RefreshOutcome, Session } from "./session";

/**
 * Keeps the tabs of one browser on one session (A3, owner decision):
 * - the Web Lock `auth-refresh` lets one tab refresh at a time, so two tabs never
 *   spend the same single-use refresh token;
 * - the `BroadcastChannel("auth")` hands the new access token to the other tabs, so
 *   a tab that waited on the lock uses it instead of refreshing again, and carries
 *   logins and logouts, so logging out in one tab logs out every tab.
 *
 * Without the Web Locks API or BroadcastChannel (old browsers) each tab works on
 * its own. That is still safe: the tabs share the cookie, so a second refresh
 * after the first uses the rotated token; only a truly simultaneous one can fail.
 */

const LOCK_NAME = "auth-refresh";
const CHANNEL_NAME = "auth";

type TabMessage =
  | { type: "credentials"; credentials: Credentials }
  /** The signed-in user's details changed (a new name), with no new token. */
  | { type: "user"; user: AuthUser }
  | { type: "logout" };

function parseMessage(data: unknown): TabMessage | null {
  if (!isRecord(data)) return null;
  if (data.type === "logout") return { type: "logout" };
  if (data.type === "credentials") {
    const credentials = parseCredentials(data.credentials);
    return credentials ? { type: "credentials", credentials } : null;
  }
  if (data.type === "user") {
    const user = parseUser(data.user);
    return user ? { type: "user", user } : null;
  }
  return null;
}

export type TabChannel = {
  post: (message: TabMessage) => void;
  subscribe: (listener: (message: TabMessage) => void) => void;
};

export function createTabChannel(): TabChannel {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, subscribe: () => {} };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      channel.addEventListener("message", (event: MessageEvent<unknown>) => {
        const message = parseMessage(event.data);
        if (message) listener(message);
      });
    },
  };
}

/**
 * Wraps the server refresh in the cross-tab lock. A tab that had to wait checks,
 * once it holds the lock, whether another tab broadcast new credentials meanwhile,
 * and uses those instead of spending the refresh token again. The winner posts its
 * credentials while it still holds the lock, so they are on their way before the
 * next tab gets in.
 */
export function withRefreshLock(refresh: () => Promise<RefreshOutcome>, channel: TabChannel): () => Promise<RefreshOutcome> {
  let received = 0;
  let latest: Credentials | null = null;
  channel.subscribe((message) => {
    if (message.type !== "credentials") return;
    received += 1;
    latest = message.credentials;
  });

  const refreshOnce = async (seen: number): Promise<RefreshOutcome> => {
    if (received !== seen && latest !== null) return { kind: "ok", ...latest };
    const outcome = await refresh();
    if (outcome.kind === "ok") {
      const { kind: _ok, ...credentials } = outcome;
      channel.post({ type: "credentials", credentials });
    }
    return outcome;
  };

  return async () => {
    const seen = received;
    if (typeof navigator === "undefined" || !("locks" in navigator)) return refreshOnce(seen);
    // `request` resolves to the callback's result; awaiting flattens the promise in it.
    return await navigator.locks.request(LOCK_NAME, () => refreshOnce(seen));
  };
}

/**
 * Relays this tab's logins, user updates and logouts to the other tabs, and theirs
 * into this tab's session. Credentials from a refresh are posted by `withRefreshLock`.
 */
export function connectTabs(session: Session, channel: TabChannel): void {
  session.onCredentials((credentials, origin) => {
    if (origin === "login") channel.post({ type: "credentials", credentials });
  });
  session.onUserUpdated((user, origin) => {
    if (origin === "local") channel.post({ type: "user", user });
  });
  session.onLoggedOut((origin) => {
    if (origin === "local") channel.post({ type: "logout" });
  });
  channel.subscribe((message) => {
    if (message.type === "credentials") session.setCredentials(message.credentials, "remote");
    else if (message.type === "user") session.updateUser(message.user, "remote");
    else session.logOut("remote");
  });
}

/** Refresh this long before the access token runs out (owner decision). */
const PROACTIVE_LEAD_SECONDS = 60;

/**
 * When to refresh a token that lives `expiresIn` seconds: 60 s before it runs out.
 * A token shorter than two minutes (test setups) is refreshed at half its life
 * instead, so a short token cannot cause a refresh loop.
 */
export function proactiveDelayMs(expiresIn: number): number {
  const seconds = expiresIn > 2 * PROACTIVE_LEAD_SECONDS ? expiresIn - PROACTIVE_LEAD_SECONDS : expiresIn / 2;
  return Math.max(1, seconds) * 1000;
}

/**
 * Renews the access token before it expires, so the stream is not cut (A3 step 5).
 * Every tab schedules its own timer; the lock and the broadcast mean only the
 * first one to fire refreshes. A timer that fires late (background tabs are
 * throttled) is harmless: an expired token is renewed on its first `401`, and
 * the stream reconnects on `session-expired`.
 */
export function startProactiveRefresh(session: Session): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  session.onCredentials(({ accessToken, expiresIn }) => {
    clear();
    timer = setTimeout(() => {
      timer = undefined;
      void session.renew(accessToken);
    }, proactiveDelayMs(expiresIn));
  });
  session.onLoggedOut(clear);
}
