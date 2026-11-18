import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
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
  sessions: Pick<SessionRepository, "create" | "delete">;
  /** Reads a session and refreshes its access token when it is about to expire. */
  tokens: Pick<TokenRefresher, "getSession">;
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
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
