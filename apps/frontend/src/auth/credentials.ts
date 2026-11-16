import { isRecord } from "../utils/guards";
import type { AuthUser, Credentials } from "./session";

/** Sent on every auth call. A cross-site form cannot set it (A3's CSRF check); it also makes login set the cookie. */
export const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
  "X-Requested-With": "fetch",
};

/** The user summary of a login or refresh response, or null when it is not one. */
export function parseUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) return null;
  const { id, email, name } = value;
  if (typeof id !== "string" || typeof email !== "string" || typeof name !== "string") return null;
  return { id, email, name };
}

/** The body of a login or refresh response, or null when it is not one. */
export function parseCredentials(json: unknown): Credentials | null {
  if (!isRecord(json)) return null;
  const { accessToken, expiresIn } = json;
  const user = parseUser(json.user);
  if (typeof accessToken !== "string" || typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || !user) {
    return null;
  }
  return { accessToken, expiresIn, user };
}
