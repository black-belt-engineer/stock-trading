import { createSession, type RefreshOutcome } from "../auth/session";
import { isRecord } from "../utils/guards";
import { createApiClient } from "./client";

export { AuthUnavailableError, LoggedOutError } from "./client";

/**
 * Asks the auth service for a new access token. The refresh token travels in the
 * `httpOnly` cookie (README Q2; the cookie is set from A3 on), so the body is empty.
 * `X-Requested-With` is a header a cross-site form cannot send (A3's CSRF check).
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
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: "{}",
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status >= 400 && response.status < 500) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "unavailable" };
  const json: unknown = await response.json().catch(() => null);
  if (!isRecord(json) || typeof json.accessToken !== "string" || typeof json.expiresIn !== "number") {
    return { kind: "unavailable" };
  }
  return { kind: "ok", accessToken: json.accessToken, expiresIn: json.expiresIn };
}

export const session = createSession(refreshFromServer);

export const apiFetch = createApiClient(session);
