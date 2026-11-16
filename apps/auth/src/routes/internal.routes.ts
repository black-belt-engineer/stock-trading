import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { sessionSummaryBodySchema, userIdParamsSchema } from "../models/auth.js";
import type { InternalGuard } from "@stock-platform/auth-guard";
import type { AuthService } from "../services/auth.service.js";

export type InternalRouteDeps = { authService: AuthService; internalGuard: InternalGuard };

/**
 * Service-to-service endpoints, guarded by the shared internal token. Kept outside `/auth/` because
 * the planned reverse proxy (Q9) forwards `/auth/*` to browsers; `/internal/*` must never be exposed.
 */
const internalRoutesImpl: FastifyPluginAsyncTypebox<InternalRouteDeps> = async (fastify, opts) => {
  const { authService, internalGuard } = opts;

  // The user service calls this before it deletes an account or changes its email or password.
  fastify.post(
    "/internal/users/:id/sessions/revoke",
    { preHandler: internalGuard, schema: { params: userIdParamsSchema } },
    async (request, reply) => {
      await authService.revokeAllSessions(request.params.id);
      return reply.code(204).send();
    },
  );

  // The user service calls this before it changes a name, so refreshes stop returning the old one.
  fastify.put(
    "/internal/users/:id/sessions/summary",
    { preHandler: internalGuard, schema: { params: userIdParamsSchema, body: sessionSummaryBodySchema } },
    async (request, reply) => {
      await authService.updateSessionSummaries({ id: request.params.id, ...request.body });
      return reply.code(204).send();
    },
  );
};

export const internalRoutes = fp(internalRoutesImpl, { name: "internal-routes" });
