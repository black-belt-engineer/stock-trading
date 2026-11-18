/** The query parameter that carries the page to return to on the old `/login` and `/register` links. */
export const NEXT_PARAM = "next";

const AUTH_PATHS = new Set(["/login", "/register"]);

/**
 * The validated place to go after login or registration: a path on this origin,
 * or `/` for anything else. Guards against open redirects:
 * `//evil.com` and `/\evil.com` are protocol-relative URLs to another host,
 * `https://…` and `javascript:` are not paths at all. The login and register
 * pages themselves are not targets, so the redirect cannot loop.
 *
 * `origin` is the app's own origin; a parameter so the tests need no window.
 */
export function safeRedirectTarget(raw: string | null, origin: string): string {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
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
  if (AUTH_PATHS.has(url.pathname)) return "/";
  return url.pathname + url.search + url.hash;
}

/**
 * The BFF's login URL: `/bff/login`, with the page to return to afterwards (a path; the
 * BFF validates it again) and `prompt=create` for registration. No `returnTo` for `/`.
 */
export function bffLoginUrl(returnTo: string, options: { register?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (returnTo !== "/") params.set("returnTo", returnTo);
  if (options.register) params.set("prompt", "create");
  const query = params.toString();
  return query === "" ? "/bff/login" : `/bff/login?${query}`;
}
