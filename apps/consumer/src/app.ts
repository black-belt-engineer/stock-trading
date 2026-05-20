import { isAppError } from "@stock-platform/errors";
import { dbPlugin } from "@stock-platform/db";
import { redisPlugin } from "@stock-platform/redis";
import { createLogger } from "@stock-platform/logger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { HealthService } from "./services/health.service.js";

export async function buildApp(config: AppConfig): Promise<{
  app: FastifyInstance;
  healthService: HealthService;
}> {
  const log = createLogger("consumer", {
    level: config.LOG_LEVEL,
    environment: config.NODE_ENV,
  });

  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });
  await app.register(redisPlugin, { url: config.REDIS_URL });

  const healthService = new HealthService(app.db, app.redis);
  await app.register(healthRoutes, { healthService });

  return { app, healthService };
}
