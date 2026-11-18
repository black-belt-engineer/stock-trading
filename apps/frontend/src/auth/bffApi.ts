import { isRecord } from "../utils/guards";
import type { AuthUser } from "./user";

const HEADERS = { "X-Requested-With": "fetch" } as const;

/** What `GET /bff/me` says: a user, no session, or "cannot tell" (the BFF, Redis or Keycloak is down). */
export type MeResult = { kind: "ok"; user: AuthUser } | { kind: "anonymous" } | { kind: "unavailable" };

function parseMe(json: unknown): AuthUser | null {
  if (!isRecord(json) || !isRecord(json.user)) return null;
  const { id, email, name } = json.user;
  if (typeof id !== "string" || typeof email !== "string" || typeof name !== "string") return null;
  return { id, email, name };
}

/**
 * Asks the BFF who is signed in. Only `401` means logged out; a `5xx`, a network error
 * or an unreadable body must not, because the session may be fine.
 */
export async function fetchMe(signal?: AbortSignal): Promise<MeResult> {
  let response: Response;
  try {
    response = await fetch("/bff/me", { credentials: "same-origin", headers: HEADERS, signal });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status === 401) return { kind: "anonymous" };
  if (!response.ok) return { kind: "unavailable" };
  const user = parseMe(await response.json().catch(() => null));
  return user ? { kind: "ok", user } : { kind: "unavailable" };
}

/**
 * Ends the session in the BFF. Resolves to Keycloak's end-session URL (the page must go
 * there to end the single sign-on session too), or `null` when there was no session to
 * end. Rejects when the BFF could not do it: the session is then still alive.
 */
export async function logOutOnServer(): Promise<string | null> {
  const response = await fetch("/bff/logout", { method: "POST", credentials: "same-origin", headers: HEADERS });
  if (!response.ok) throw new Error(`Logout failed with ${response.status}`);
  const json: unknown = await response.json().catch(() => null);
  return isRecord(json) && typeof json.endSessionUrl === "string" ? json.endSessionUrl : null;
}
