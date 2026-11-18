import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { createRemoteJWKSet } from "jose";
import type * as client from "openid-client";
import type { SessionRepository } from "../repositories/session.repository.js";
import {
  IdentityProviderUnavailableError,
  LoginRejectedError,
  completeLogin,
} from "../services/callback.service.js";
import {
  LOGIN_ACTIONS,
  decodeLoginState,
  encodeLoginState,
  startLogin,
} from "../services/login.service.js";
import { buildLogoutUrl, revokeRefreshToken } from "../services/logout.service.js";
import { requireCsrfHeader } from "../services/csrf.js";
import { InvalidLogoutTokenError, verifyLogoutToken, type LogoutTokenSettings } from "../services/logout-token.service.js";
import { safeReturnTo } from "../services/return-to.js";
import { sessionCookieName } from "../services/session-cookie.js";
import type { TokenRefresher } from "../services/token-refresh.service.js";

export const LOGIN_COOKIE = "login";
const LOGIN_COOKIE_MAX_AGE_S = 10 * 60;

export type AuthRouteDeps = {
  oidc: client.Configuration;
  /** The app's public origin: `returnTo` is checked against it and the callback URL is built from it. */
  publicOrigin: string;
  production: boolean;
  /** Only what the routes need. */
  sessions: Pick<SessionRepository, "create" | "delete" | "deleteBySid" | "deleteBySub" | "get">;
  /** Reads a session and refreshes its access token when it is about to expire. */
  tokens: Pick<TokenRefresher, "getSession">;
  /** Keycloak's signing keys for the logout token. Defaults to the discovery document's `jwks_uri`. */
  logoutKeys?: LogoutTokenSettings["keys"];
};

const LoginQuery = Type.Object({
  returnTo: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.Literal("create")),
  idp: Type.Optional(Type.Literal("google")),
  action: Type.Optional(Type.Union(LOGIN_ACTIONS.map((a) => Type.Literal(a)))),
});

const CallbackQuery = Type.Object({
  state: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

const authRoutesImpl: FastifyPluginAsyncTypebox<AuthRouteDeps> = async (fastify, opts) => {
  const { oidc, publicOrigin, production, sessions, tokens } = opts;
  const sessionCookie = sessionCookieName(production);
  const redirectUri = `${publicOrigin}/bff/callback`;
  const metadata = oidc.serverMetadata();
  if (opts.logoutKeys === undefined && metadata.jwks_uri === undefined) {
    throw new Error("The discovery document has no jwks_uri, so logout tokens cannot be checked");
  }
  const logoutSettings: LogoutTokenSettings = {
    issuer: metadata.issuer,
    audience: oidc.clientMetadata().client_id,
    // `jwks_uri` is on the internal address (see discoverOidc). The key set is cached and
    // refetched when an unknown `kid` shows up.
    keys: opts.logoutKeys ?? createRemoteJWKSet(new URL(metadata.jwks_uri ?? "")),
  };

  fastify.get("/bff/login", { schema: { querystring: LoginQuery } }, async (request, reply) => {
    const { returnTo, prompt, idp, action } = request.query;
    const login = await startLogin(oidc, {
      redirectUri,
      returnTo: safeReturnTo(returnTo, publicOrigin),
      ...(prompt ? { prompt } : {}),
      ...(idp ? { idp } : {}),
      ...(action ? { action } : {}),
    });

    // Lax, not Strict: the callback is a cross-site navigation from Keycloak or Google, and a
    // Strict cookie would not be sent on it. Signed, so the callback can trust what it reads.
    return reply
      .setCookie(LOGIN_COOKIE, encodeLoginState(login.state), {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        path: "/bff/callback",
        maxAge: LOGIN_COOKIE_MAX_AGE_S,
        signed: true,
      })
      .header("Cache-Control", "no-store")
      .redirect(login.url.href);
  });

  fastify.get("/bff/callback", { schema: { querystring: CallbackQuery } }, async (request, reply) => {
    // The login cookie is single use: it goes whatever the outcome.
    reply.clearCookie(LOGIN_COOKIE, { path: "/bff/callback" }).header("Cache-Control", "no-store");

    const raw = request.cookies[LOGIN_COOKIE];
    const unsigned = raw === undefined ? undefined : request.unsignCookie(raw);
    const login = unsigned?.valid && unsigned.value !== null ? decodeLoginState(unsigned.value) : undefined;
    if (!login) {
      return reply.code(400).send({ error: "The login expired, start again", code: "LOGIN_EXPIRED" });
    }
    if (request.query.state !== login.state) {
      return reply.code(400).send({ error: "The login state does not match", code: "STATE_MISMATCH" });
    }

    // Keycloak answered with an error (the user cancelled, for example): back to the page they
    // came from, and the session stays as it was. `returnTo` was checked when the login began.
    if (request.query.error !== undefined) {
      return reply.redirect(login.returnTo);
    }

    try {
      const session = await completeLogin(oidc, new URL(request.url, publicOrigin), login);
      // A new id on every login, so an id set before login is never used afterwards.
      const id = await sessions.create(session);
      const previous = request.cookies[sessionCookie];
      if (previous !== undefined && previous !== id) {
        await sessions.delete(previous);
      }

      return reply
        .setCookie(sessionCookie, id, {
          httpOnly: true,
          sameSite: "strict",
          secure: production,
          path: "/",
          expires: new Date(session.refreshExpiresAt),
        })
        .redirect(login.returnTo);
    } catch (error) {
      if (error instanceof LoginRejectedError) {
        return reply.code(400).send({ error: "The login could not be completed", code: "LOGIN_REJECTED" });
      }
      if (error instanceof IdentityProviderUnavailableError) {
        return reply.code(503).send({ error: "Sign-in is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
      }
      throw error;
    }
  });

  // The frontend's startup check. Only the user's identity is returned, never a token.
  // A session whose access token is about to expire is refreshed here. A Redis error, or Keycloak
  // being down when the token can no longer be used, is the 503; a refused refresh is a 401.
  fastify.get("/bff/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");

    const id = request.cookies[sessionCookie];
    if (id === undefined) {
      return reply.code(401).send({ error: "Not signed in", code: "UNAUTHENTICATED" });
    }

    let session;
    try {
      session = await tokens.getSession(id);
    } catch (error) {
      request.log.error({ err: error }, "Session or identity provider unavailable");
      return reply.code(503).send({ error: "Sign-in is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
    }
    if (session === undefined) {
      return reply.code(401).send({ error: "Not signed in", code: "UNAUTHENTICATED" });
    }

    return { user: { id: session.sub, name: session.name, email: session.email } };
  });

  // Ends the BFF session, revokes the refresh token, and answers with Keycloak's end-session URL.
  // The page navigates there, so the SSO session ends too; without it the next login would
  // succeed silently. The token is revoked on a best effort: the session is deleted first, and a
  // Keycloak failure is only logged. `endSessionUrl` is null when there was no session to read.
  fastify.post("/bff/logout", { preHandler: requireCsrfHeader }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");

    const id = request.cookies[sessionCookie];
    if (id === undefined) {
      return { endSessionUrl: null };
    }

    let session;
    try {
      // Read directly, not refreshed: a logout must not need Keycloak to be up.
      session = await sessions.get(id);
      await sessions.delete(id);
    } catch (error) {
      request.log.error({ err: error }, "Session store unavailable");
      return reply.code(503).send({ error: "Sign-out is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
    }

    reply.clearCookie(sessionCookie, { path: "/", httpOnly: true, sameSite: "strict", secure: production });
    if (session === undefined) {
      return { endSessionUrl: null };
    }

    const failure = await revokeRefreshToken(oidc, session);
    if (failure) {
      request.log.warn({ err: failure }, "Refresh token revocation failed");
    }
    return { endSessionUrl: buildLogoutUrl(oidc, session, `${publicOrigin}/`) };
  });

  // Keycloak calls this server to server when a session ends elsewhere (admin console, account
  // deletion, password change). It sends a form with `logout_token`. No CSRF header and no
  // cookie: Keycloak cannot send them, and the signed token is the proof. The body is parsed here
  // only, so no form-body dependency is needed.
  fastify.register(async (scope) => {
    scope.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(typeof body === "string" ? body : body.toString())));
    });

    scope.post("/bff/backchannel-logout", async (request, reply) => {
      reply.header("Cache-Control", "no-store");

      const body: unknown = request.body;
      const token =
        typeof body === "object" && body !== null && "logout_token" in body ? body.logout_token : undefined;
      if (typeof token !== "string" || token === "") {
        return reply.code(400).send({ error: "logout_token is missing", code: "INVALID_LOGOUT_TOKEN" });
      }

      let target;
      try {
        target = await verifyLogoutToken(token, logoutSettings);
      } catch (error) {
        if (error instanceof InvalidLogoutTokenError) {
          request.log.warn({ err: error }, "Back-channel logout token rejected");
          return reply.code(400).send({ error: "The logout token is not valid", code: "INVALID_LOGOUT_TOKEN" });
        }
        // The key set could not be fetched, so the token is neither accepted nor rejected.
        request.log.error({ err: error }, "Logout token could not be checked");
        return reply.code(503).send({ error: "Logout is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
      }

      try {
        if (target.kind === "sid") {
          await sessions.deleteBySid(target.sid);
        } else {
          await sessions.deleteBySub(target.sub);
        }
      } catch (error) {
        request.log.error({ err: error }, "Session store unavailable");
        return reply.code(503).send({ error: "Logout is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
      }
      return reply.code(200).send({});
    });
  });
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
