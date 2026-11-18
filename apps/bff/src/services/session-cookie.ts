/**
 * The session cookie. `__Host-` needs `Secure`, which plain `http://localhost` does not have, so
 * the prefix is only used in production.
 */
export function sessionCookieName(production: boolean): string {
  return production ? "__Host-session" : "session";
}
