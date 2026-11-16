import { isRecord } from "../utils/guards";
import { BROWSER_HEADERS, parseCredentials } from "./credentials";
import type { Credentials } from "./session";

/** A login or registration result: credentials, or the message the form shows. */
export type AuthResult = { ok: true; credentials: Credentials } | { ok: false; message: string };

const UNAVAILABLE = "Service unavailable, try again";

/** "Too many attempts, try again in N minutes", from the `Retry-After` seconds. */
export function tooManyAttemptsMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 15;
  return `Too many attempts, try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

async function serverMessage(response: Response): Promise<string | null> {
  const json: unknown = await response.json().catch(() => null);
  return isRecord(json) && typeof json.error === "string" ? json.error : null;
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: BROWSER_HEADERS,
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/**
 * Logs in. The header makes the auth service set the refresh cookie and leave the
 * refresh token out of the body. A wrong email or password stays one generic
 * message; a service that is down never reads as a wrong password.
 */
export async function logIn(email: string, password: string): Promise<AuthResult> {
  const response = await post("/auth/login", { email, password });
  if (response === null) return { ok: false, message: UNAVAILABLE };
  if (response.status === 401) return { ok: false, message: "Invalid email or password" };
  if (response.status === 429) return { ok: false, message: tooManyAttemptsMessage(response.headers.get("Retry-After")) };
  if (response.status === 400) return { ok: false, message: "Enter your email and password" };
  if (!response.ok) return { ok: false, message: UNAVAILABLE };
  const credentials = parseCredentials(await response.json().catch(() => null));
  return credentials ? { ok: true, credentials } : { ok: false, message: UNAVAILABLE };
}

/** Creates the account, then logs in with the same details (A3 step 6). */
export async function register(email: string, name: string, password: string): Promise<AuthResult> {
  const response = await post("/users", { email, name, password });
  if (response === null) return { ok: false, message: UNAVAILABLE };
  // 409 says the email is taken; accepted for this project (A3 edge cases).
  if (response.status === 409) return { ok: false, message: (await serverMessage(response)) ?? "This email is already registered" };
  if (response.status === 429) return { ok: false, message: tooManyAttemptsMessage(response.headers.get("Retry-After")) };
  if (response.status === 400) {
    return { ok: false, message: "Enter a valid email, a name and a password of at least 8 characters" };
  }
  if (!response.ok) return { ok: false, message: UNAVAILABLE };
  const login = await logIn(email, password);
  if (login.ok) return login;
  return { ok: false, message: `Your account was created, but logging in failed: ${login.message}` };
}

/**
 * Ends the session on the server, which also clears the cookie. A failure is
 * ignored: the caller forgets the token either way, and the user sees the login page.
 */
export async function logOutOnServer(): Promise<void> {
  await post("/auth/logout", {});
}
