import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import type * as client from "openid-client";
import { LOGIN_ACTIONS, encodeLoginState, startLogin } from "../services/login.service.js";
import { safeReturnTo } from "../services/return-to.js";

export const LOGIN_COOKIE = "login";
const LOGIN_COOKIE_MAX_AGE_S = 10 * 60;

export type AuthRouteDeps = {
  oidc: client.Configuration;
  /** The app's public origin: `returnTo` is checked against it and the callback URL is built from it. */
  publicOrigin: string;
  production: boolean;
};

const LoginQuery = Type.Object({
  returnTo: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.Literal("create")),
  idp: Type.Optional(Type.Literal("google")),
  action: Type.Optional(Type.Union(LOGIN_ACTIONS.map((a) => Type.Literal(a)))),
});

const authRoutesImpl: FastifyPluginAsyncTypebox<AuthRouteDeps> = async (fastify, opts) => {
  const { oidc, publicOrigin, production } = opts;
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
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
