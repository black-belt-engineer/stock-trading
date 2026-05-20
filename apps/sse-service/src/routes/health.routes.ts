import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { LivenessResponse, ReadinessResponse } from "@stock-platform/schemas";
import type { ConnectionTrackerService } from "../services/connection-tracker.service.js";
import { HealthService } from "../services/health.service.js";

export type HealthRouteDeps = {
  healthService: HealthService;
  connectionTracker: ConnectionTrackerService;
};

const healthRoutesImpl: FastifyPluginAsync<HealthRouteDeps> = async (fastify, opts) => {
  const { healthService, connectionTracker } = opts;

  fastify.get("/health/live", async (): Promise<LivenessResponse> => ({
    status: "ok",
  }));

  fastify.get("/health/ready", async (_request, reply): Promise<ReadinessResponse> => {
    const { ok, checks } = await healthService.checkReadiness();
    const body: ReadinessResponse = {
      status: ok ? "ok" : "unavailable",
      checks,
    };
    if (!ok) {
      return reply.code(503).send(body);
    }
    return body;
  });

  fastify.get("/health", async () => ({
    status: "ok" as const,
    activeConnections: connectionTracker.getActiveConnections(),
  }));
};

export const healthRoutes = fp(healthRoutesImpl, { name: "health-routes" });
