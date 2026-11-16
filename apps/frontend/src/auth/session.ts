/**
 * The access token, in memory only (README Q2), and the single-flight refresh.
 *
 * Refresh tokens are single-use (`GETDEL` in the auth service): two refreshes in
 * parallel would consume the token twice, the second would fail and the user would
 * be logged out. So every caller that needs a new token shares one refresh call.
 *
 * Phase 10 / A3 adds on top: the refresh cookie, the auth context and its pages,
 * the cross-tab lock and broadcast, and the proactive refresh before expiry.
 */

export type RefreshOutcome =
  | { kind: "ok"; accessToken: string; expiresIn: number }
  /** The server has no session for us: log out. */
  | { kind: "unauthorized" }
  /** The auth service could not be reached or failed: keep the session state and retry later. */
  | { kind: "unavailable" };

export type RenewResult = "ok" | "logged-out" | "unavailable";

export type Session = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  /**
   * Gets a token to replace `rejected`, the one the server just refused. When the
   * current token is already a different one (another caller refreshed meanwhile),
   * it is used without a new refresh. Concurrent calls share one refresh.
   */
  renew: (rejected: string | null) => Promise<RenewResult>;
  /** Forgets the token and tells the listeners. */
  logOut: () => void;
  /** Called on every logout. Returns the unsubscribe function. */
  onLoggedOut: (listener: () => void) => () => void;
};

export function createSession(refresh: () => Promise<RefreshOutcome>): Session {
  let accessToken: string | null = null;
  let inFlight: Promise<RenewResult> | null = null;
  const listeners = new Set<() => void>();

  const logOut = (): void => {
    accessToken = null;
    for (const listener of [...listeners]) listener();
  };

  const runRefresh = async (): Promise<RenewResult> => {
    const outcome = await refresh().catch((): RefreshOutcome => ({ kind: "unavailable" }));
    if (outcome.kind === "ok") {
      accessToken = outcome.accessToken;
      return "ok";
    }
    if (outcome.kind === "unauthorized") {
      logOut();
      return "logged-out";
    }
    return "unavailable";
  };

  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    renew: (rejected) => {
      if (accessToken !== null && accessToken !== rejected) return Promise.resolve("ok");
      if (inFlight === null) {
        inFlight = runRefresh().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    logOut,
    onLoggedOut: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
