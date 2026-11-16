import { parseUser } from "../auth/credentials";
import type { AuthUser } from "../auth/session";
import { isRecord } from "../utils/guards";
import { apiFetch, LoggedOutError } from ".";

/** The body of `PATCH /users/:id`: only the fields that change. */
export type AccountChanges = { name?: string; email?: string; password?: string; currentPassword?: string };

export type AccountError =
  /** `400`: the body broke the schema (the form's own checks should prevent it). */
  | { kind: "invalid"; message: string }
  /** `403`: the current password is wrong. Nothing changed. */
  | { kind: "wrong-password" }
  /** `409`: the new email belongs to another account. */
  | { kind: "email-taken"; message: string }
  /** `5xx`, a network error, or the auth service down during a token refresh. */
  | { kind: "unavailable" };

export type UpdateResult = { ok: true; user: AuthUser } | { ok: false; error: AccountError };
export type DeleteResult = { ok: true } | { ok: false; error: AccountError };

async function serverMessage(response: Response): Promise<string | null> {
  const json: unknown = await response.json().catch(() => null);
  return isRecord(json) && typeof json.error === "string" && json.error !== "" ? json.error : null;
}

async function errorOf(response: Response): Promise<AccountError> {
  if (response.status === 400) return { kind: "invalid", message: (await serverMessage(response)) ?? "Check the fields and try again" };
  if (response.status === 403) return { kind: "wrong-password" };
  if (response.status === 409) {
    return { kind: "email-taken", message: (await serverMessage(response)) ?? "A user with this email already exists" };
  }
  return { kind: "unavailable" };
}

/**
 * Sends the request through `apiFetch`. A `LoggedOutError` is passed on: the
 * session is gone and the route guard takes over. Everything else that is not an
 * HTTP answer (a network error, `AuthUnavailableError`) reads as "unavailable".
 */
async function send(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await apiFetch(path, init);
  } catch (error) {
    if (error instanceof LoggedOutError) throw error;
    return null;
  }
}

/** `PATCH /users/:id`. Changing the email or password ends every session of the account (phase 09). */
export async function updateAccount(userId: string, changes: AccountChanges): Promise<UpdateResult> {
  const response = await send(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (response === null) return { ok: false, error: { kind: "unavailable" } };
  if (!response.ok) return { ok: false, error: await errorOf(response) };
  const user = parseUser(await response.json().catch(() => null));
  return user ? { ok: true, user } : { ok: false, error: { kind: "unavailable" } };
}

/** `DELETE /users/:id`. The server ends every session before the account goes. */
export async function deleteAccount(userId: string): Promise<DeleteResult> {
  const response = await send(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (response === null) return { ok: false, error: { kind: "unavailable" } };
  if (response.status === 204) return { ok: true };
  return { ok: false, error: await errorOf(response) };
}
