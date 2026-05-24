import { isAppError } from "@stock-platform/errors";
import { redisPlugin } from "@stock-platform/redis";
import { createLogger } from "@stock-platform/logger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { LatestPriceRepository } from "./repositories/latest-price.repository.js";
import { healthRoutes } from "./routes/health.routes.js";
import { quotesRoutes } from "./routes/quotes.routes.js";
import { streamRoutes } from "./routes/stream.routes.js";
import { ConnectionTrackerService } from "./services/connection-tracker.service.js";
import { HealthService } from "./services/health.service.js";
import { QuotesService } from "./services/quotes.service.js";
import { StreamSubscriptionService } from "./services/stream-subscription.service.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const log = createLogger("sse-service", {
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

  await app.register(redisPlugin, { url: config.REDIS_URL });

  const latestPriceRepository = new LatestPriceRepository(app.redis);
  const quotesService = new QuotesService(latestPriceRepository);
  const streamSubscriptionService = new StreamSubscriptionService(
    app.redis,
    latestPriceRepository,
  );
  const connectionTracker = new ConnectionTrackerService();
  const healthService = new HealthService(app.redis);

  await app.register(healthRoutes, { healthService, connectionTracker });
  await app.register(quotesRoutes, { quotesService });
  await app.register(streamRoutes, { connectionTracker, log, streamSubscriptionService });

  return app;
}
