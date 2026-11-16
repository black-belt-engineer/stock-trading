import { BROWSER_HEADERS, parseCredentials } from "../auth/credentials";
import { createSession, type RefreshOutcome } from "../auth/session";
import { connectTabs, createTabChannel, startProactiveRefresh, withRefreshLock } from "../auth/tabSync";
import { createApiClient } from "./client";

export { AuthUnavailableError, LoggedOutError } from "./client";

/**
 * Asks the auth service for a new access token. The refresh token travels in the
 * `httpOnly` cookie (README Q2), so the body is empty.
 *
 * Any `4xx` means there is no usable session. A `5xx` or a network error means the
 * auth service is in trouble, which must not log the user out.
 */
async function refreshFromServer(): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetch("/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: BROWSER_HEADERS,
      body: "{}",
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status >= 400 && response.status < 500) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "unavailable" };
  const credentials = parseCredentials(await response.json().catch(() => null));
  return credentials ? { kind: "ok", ...credentials } : { kind: "unavailable" };
}

const tabs = createTabChannel();

/** The app's one session: the refresh is single-flight in this tab and, through the lock, across tabs. */
export const session = createSession(withRefreshLock(refreshFromServer, tabs));
connectTabs(session, tabs);
startProactiveRefresh(session);

export const apiFetch = createApiClient(session);
