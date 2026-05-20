import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { LivenessResponse, ReadinessResponse } from "@stock-platform/schemas";
import type { IngestionService } from "../services/ingestion.service.js";

export type HealthRouteDeps = {
  ingestionService: IngestionService;
};

const healthRoutesImpl: FastifyPluginAsync<HealthRouteDeps> = async (fastify, opts) => {
  const { ingestionService } = opts;

  fastify.get("/health/live", async (): Promise<LivenessResponse> => ({
    status: "ok",
  }));

  fastify.get("/health/ready", async (): Promise<ReadinessResponse> => ({
    status: "ok",
    checks: {},
  }));

  fastify.get("/health", async () => ({
    status: "ok" as const,
    ...ingestionService.getHealth(),
  }));
};

export const healthRoutes = fp(healthRoutesImpl, { name: "health-routes" });
