import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import { redisPlugin } from "@stock-platform/redis";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { HealthService } from "./services/health.service.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const log = createLogger("bff", { level: config.LOG_LEVEL, environment: config.NODE_ENV });

  const app = Fastify({ logger: false });

  app.setErrorHandler((error: Error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    if ("validation" in error && error.validation) {
      return reply.code(400).send({ error: error.message, code: "VALIDATION_ERROR" });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(redisPlugin, { url: config.REDIS_URL });
  await app.register(healthRoutes, { healthService: new HealthService(app.redis) });

  return app;
}
