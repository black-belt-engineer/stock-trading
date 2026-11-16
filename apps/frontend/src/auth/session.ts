/**
 * The access token and the signed-in user, in memory only (README Q2), and the
 * single-flight refresh.
 *
 * Refresh tokens are single-use (`GETDEL` in the auth service): two refreshes in
 * parallel would consume the token twice, the second would fail and the user would
 * be logged out. So every caller that needs a new token shares one refresh call.
 * Across tabs the same holds through the lock in `tabSync.ts`.
 */

export type AuthUser = { id: string; email: string; name: string };

export type Credentials = {
  accessToken: string;
  /** Access token lifetime in seconds, as the server sent it. */
  expiresIn: number;
  user: AuthUser;
};

export type RefreshOutcome =
  | ({ kind: "ok" } & Credentials)
  /** The server has no session for us: log out. */
  | { kind: "unauthorized" }
  /** The auth service could not be reached or failed: keep the session state and retry later. */
  | { kind: "unavailable" };

export type RenewResult = "ok" | "logged-out" | "unavailable";

/** Where new credentials came from: this tab's login, this tab's refresh, or another tab. */
export type CredentialsOrigin = "login" | "refresh" | "remote";
/** Who ended the session: this tab, or another tab that told us. */
export type LogoutOrigin = "local" | "remote";

export type Session = {
  getAccessToken: () => string | null;
  getUser: () => AuthUser | null;
  /** Stores credentials from a login (or, with `"remote"`, from another tab) and tells the listeners. */
  setCredentials: (credentials: Credentials, origin?: "login" | "remote") => void;
  /** Replaces the token only, for callers that have no user. Tells no one. */
  setAccessToken: (token: string | null) => void;
  /**
   * Gets a token to replace `rejected`, the one the server just refused. When the
   * current token is already a different one (another caller refreshed meanwhile),
   * it is used without a new refresh. Concurrent calls share one refresh.
   */
  renew: (rejected: string | null) => Promise<RenewResult>;
  /**
   * Replaces the signed-in user's details (a changed name) and tells the listeners.
   * Ignored when no one is signed in or `user` is someone else: a late message from
   * another tab must not put a different account's details on this one.
   */
  updateUser: (user: AuthUser, origin?: "local" | "remote") => void;
  /** Forgets the token and the user, and tells the listeners. */
  logOut: (origin?: LogoutOrigin) => void;
  /** Called on every logout. Returns the unsubscribe function. */
  onLoggedOut: (listener: (origin: LogoutOrigin) => void) => () => void;
  /** Called whenever new credentials are stored. Returns the unsubscribe function. */
  onCredentials: (listener: (credentials: Credentials, origin: CredentialsOrigin) => void) => () => void;
  /** Called whenever `updateUser` changes the user. Returns the unsubscribe function. */
  onUserUpdated: (listener: (user: AuthUser, origin: "local" | "remote") => void) => () => void;
};

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function createSession(refresh: () => Promise<RefreshOutcome>): Session {
  let accessToken: string | null = null;
  let user: AuthUser | null = null;
  let inFlight: Promise<RenewResult> | null = null;
  const logoutListeners = new Set<(origin: LogoutOrigin) => void>();
  const credentialListeners = new Set<(credentials: Credentials, origin: CredentialsOrigin) => void>();
  const userListeners = new Set<(user: AuthUser, origin: "local" | "remote") => void>();

  const store = (credentials: Credentials, origin: CredentialsOrigin): void => {
    accessToken = credentials.accessToken;
    user = credentials.user;
    for (const listener of [...credentialListeners]) listener(credentials, origin);
  };

  const logOut = (origin: LogoutOrigin = "local"): void => {
    accessToken = null;
    user = null;
    for (const listener of [...logoutListeners]) listener(origin);
  };

  const runRefresh = async (): Promise<RenewResult> => {
    const outcome = await refresh().catch((): RefreshOutcome => ({ kind: "unavailable" }));
    if (outcome.kind === "ok") {
      const { kind: _ok, ...credentials } = outcome;
      store(credentials, "refresh");
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
    getUser: () => user,
    setCredentials: (credentials, origin = "login") => store(credentials, origin),
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
    updateUser: (next, origin = "local") => {
      if (user === null || user.id !== next.id) return;
      if (user.email === next.email && user.name === next.name) return;
      user = next;
      for (const listener of [...userListeners]) listener(next, origin);
    },
    logOut,
    onUserUpdated: (listener) => subscribe(userListeners, listener),
    onLoggedOut: (listener) => subscribe(logoutListeners, listener),
    onCredentials: (listener) => subscribe(credentialListeners, listener),
  };
}
