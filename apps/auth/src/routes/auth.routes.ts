import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { loginBodySchema, logoutBodySchema, refreshBodySchema, tokenResponseSchema } from "../models/auth.js";
import type { AuthService } from "../services/auth.service.js";
import type { TokenService } from "../services/token.service.js";

export type AuthRouteDeps = { authService: AuthService; tokenService: TokenService };

const authRoutesImpl: FastifyPluginAsyncTypebox<AuthRouteDeps> = async (fastify, opts) => {
  const { authService, tokenService } = opts;

  fastify.post(
    "/auth/login",
    { schema: { body: loginBodySchema, response: { 200: tokenResponseSchema } } },
    (request) => authService.login(request.body),
  );

  fastify.post(
    "/auth/refresh",
    { schema: { body: refreshBodySchema, response: { 200: tokenResponseSchema } } },
    (request) => authService.refresh(request.body.refreshToken),
  );

  fastify.post("/auth/logout", { schema: { body: logoutBodySchema } }, async (request, reply) => {
    await authService.logout(request.body.refreshToken);
    return reply.code(204).send();
  });

  // Public keys that other services use to verify access tokens locally.
  fastify.get("/.well-known/jwks.json", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return tokenService.getJwks();
  });
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
