/** Paths the BFF never returns to: the old login pages and the BFF's own routes (a loop risk). */
function isExcludedPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register" || pathname === "/bff" || pathname.startsWith("/bff/");
}

/**
 * The validated place to go after login: a path on this origin, or `/` for anything else.
 * Guards against open redirects: `//evil.com` and `/\evil.com` are protocol-relative URLs to
 * another host, `https://…` and `javascript:` are not paths at all. Copied from the frontend's
 * `auth/redirect.ts` (which goes away in commit 29), plus the `/bff` exclusion.
 *
 * `origin` is the app's public origin; a parameter so the tests need no config.
 */
export function safeReturnTo(raw: string | null | undefined, origin: string): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Browsers drop tabs and newlines inside URLs and treat `\` like `/`, so a
  // control character could turn a path into a host after the checks above.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return "/";
  }
  if (url.origin !== origin) return "/";
  if (isExcludedPath(url.pathname)) return "/";
  return url.pathname + url.search + url.hash;
}
