import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ForbiddenError, UnauthorizedError } from "@stock-platform/errors";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  tokenResponseSchema,
  type IssuedTokens,
  type TokenResponse,
} from "../models/auth.js";
import type { AuthService } from "../services/auth.service.js";
import type { TokenService } from "../services/token.service.js";

export type AuthRouteDeps = {
  authService: AuthService;
  tokenService: TokenService;
  cookie: { secure: boolean; maxAgeSeconds: number };
};

/** The browser client's marker. A cross-site form cannot set a custom header (CSRF, A3). */
const BROWSER_HEADER = "x-requested-with";
const BROWSER_HEADER_VALUE = "fetch";

export const REFRESH_COOKIE = "refresh_token";
/** Only `/auth/refresh` and `/auth/logout` ever need the cookie. */
const REFRESH_COOKIE_PATH = "/auth";

function isBrowserRequest(request: FastifyRequest): boolean {
  return request.headers[BROWSER_HEADER] === BROWSER_HEADER_VALUE;
}

function requireBrowserHeader(request: FastifyRequest): void {
  if (!isBrowserRequest(request)) {
    throw new ForbiddenError("Missing X-Requested-With: fetch header");
  }
}

/**
 * Two ways to carry the refresh token (A3 step 1, owner decision):
 * - browser (cookie mode): the token goes out as an `httpOnly` cookie and never in the body,
 *   so script on the page (XSS) cannot read it;
 * - other clients (body mode): the token goes in the body and no cookie is set.
 * Login picks the mode from `X-Requested-With: fetch`. Refresh and logout require that
 * header from everyone, so there the mode is where the token came from.
 */
const authRoutesImpl: FastifyPluginAsyncTypebox<AuthRouteDeps> = async (fastify, opts) => {
  const { authService, tokenService, cookie } = opts;
  const cookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: cookie.secure,
    path: REFRESH_COOKIE_PATH,
  };

  const sendTokens = (reply: FastifyReply, tokens: IssuedTokens, cookieMode: boolean): TokenResponse => {
    if (!cookieMode) return tokens;
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOptions, maxAge: cookie.maxAgeSeconds });
    const { refreshToken: _inCookie, ...body } = tokens;
    return body;
  };
  const clearCookie = (reply: FastifyReply): void => {
    reply.clearCookie(REFRESH_COOKIE, cookieOptions);
  };

  fastify.post(
    "/auth/login",
    { schema: { body: loginBodySchema, response: { 200: tokenResponseSchema } } },
    async (request, reply) => {
      const tokens = await authService.login(request.body, request.ip);
      const cookieMode = isBrowserRequest(request);
      // A browser that logs in again over an old session ends that session instead of
      // leaving its refresh token valid until it expires.
      const previous = request.cookies[REFRESH_COOKIE];
      if (cookieMode && previous) await authService.logout(previous);
      return sendTokens(reply, tokens, cookieMode);
    },
  );

  fastify.post(
    "/auth/refresh",
    { schema: { body: refreshBodySchema, response: { 200: tokenResponseSchema } } },
    async (request, reply) => {
      requireBrowserHeader(request);
      const fromBody = request.body.refreshToken;
      const token = fromBody ?? request.cookies[REFRESH_COOKIE];
      if (!token) throw new UnauthorizedError("No refresh token");
      const cookieMode = fromBody === undefined;
      try {
        return sendTokens(reply, await authService.refresh(token), cookieMode);
      } catch (error) {
        // A refused cookie is useless: drop it so the browser stops sending it.
        if (cookieMode && error instanceof UnauthorizedError) clearCookie(reply);
        throw error;
      }
    },
  );

  fastify.post("/auth/logout", { schema: { body: logoutBodySchema } }, async (request, reply) => {
    requireBrowserHeader(request);
    const fromBody = request.body.refreshToken;
    const token = fromBody ?? request.cookies[REFRESH_COOKIE];
    if (token) await authService.logout(token);
    if (fromBody === undefined) clearCookie(reply);
    return reply.code(204).send();
  });

  // Public keys that other services use to verify access tokens locally.
  fastify.get("/.well-known/jwks.json", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return tokenService.getJwks();
  });
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
