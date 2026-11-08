import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { UnauthorizedError } from "@stock-platform/errors";
import fp from "fastify-plugin";
import { loginBodySchema, loginResponseSchema } from "../models/auth.js";
import type { AuthService } from "../services/auth.service.js";

export type AuthRouteDeps = { authService: AuthService };

const authRoutesImpl: FastifyPluginAsyncTypebox<AuthRouteDeps> = async (fastify, opts) => {
  const { authService } = opts;

  fastify.post(
    "/auth/login",
    { schema: { body: loginBodySchema, response: { 200: loginResponseSchema } } },
    (request) => authService.login(request.body),
  );

  fastify.post("/auth/logout", async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }
    await authService.logout(token);
    return reply.code(204).send();
  });
};

export const authRoutes = fp(authRoutesImpl, { name: "auth-routes" });
