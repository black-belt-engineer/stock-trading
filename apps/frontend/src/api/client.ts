/** The server answered `401`: there is no session (it ended, or never was one). */
export class LoggedOutError extends Error {
  constructor() {
    super("Logged out");
    this.name = "LoggedOutError";
  }
}

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * The one way the app calls its APIs, through the BFF. The browser holds no token:
 * the `httpOnly` session cookie travels with the request (`same-origin`), and the BFF
 * adds the bearer token and renews it. `X-Requested-With: fetch` is on every call; the
 * BFF requires it on the ones that change data, and a cross-site form cannot set it.
 *
 * A `401` means logged out: `onLoggedOut` is told and `LoggedOutError` is thrown. Every
 * other status, `403`, `502` and `503` included, is returned to the caller as it is.
 * Whatever `fetch` throws (a network error, an abort) is passed on.
 */
export function createApiClient(onLoggedOut: () => void, fetchImpl: typeof fetch = (...args) => fetch(...args)): ApiFetch {
  return async (path, init) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Requested-With", "fetch");
    const response = await fetchImpl(path, { ...init, headers, credentials: "same-origin" });
    if (response.status === 401) {
      onLoggedOut();
      throw new LoggedOutError();
    }
    return response;
  };
}
