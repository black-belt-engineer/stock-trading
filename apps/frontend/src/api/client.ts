import type { Session } from "../auth/session";

/** The session is gone: the refresh was refused, or a fresh token was still refused. */
export class LoggedOutError extends Error {
  constructor() {
    super("Logged out");
    this.name = "LoggedOutError";
  }
}

/** A `401` needed a refresh, but the auth service could not be reached. Retry later; do not log out. */
export class AuthUnavailableError extends Error {
  constructor() {
    super("Authentication service unavailable");
    this.name = "AuthUnavailableError";
  }
}

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * The one way the app calls its APIs. Attaches the access token. On `401` it
 * renews the token (single-flight, see `Session.renew`) and retries once; a second
 * `401` logs out. Every other status, `403` and `503` included, is returned to the
 * caller as it is: a wrong current password or the guard failing to fetch its keys
 * is never a reason to refresh or log out.
 *
 * Throws `LoggedOutError` or `AuthUnavailableError` as above, and whatever `fetch`
 * throws (a network error, an abort).
 */
export function createApiClient(session: Session, fetchImpl: typeof fetch = (...args) => fetch(...args)): ApiFetch {
  const send = (path: string, init: RequestInit | undefined, token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token !== null) headers.set("Authorization", `Bearer ${token}`);
    return fetchImpl(path, { ...init, headers });
  };

  return async (path, init) => {
    const token = session.getAccessToken();
    const first = await send(path, init, token);
    if (first.status !== 401) return first;

    const renewed = await session.renew(token);
    if (renewed === "logged-out") throw new LoggedOutError();
    if (renewed === "unavailable") throw new AuthUnavailableError();

    const second = await send(path, init, session.getAccessToken());
    if (second.status === 401) {
      session.logOut();
      throw new LoggedOutError();
    }
    return second;
  };
}
