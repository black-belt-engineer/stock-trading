import { dbPlugin } from "@stock-platform/db";
import { isAppError } from "@stock-platform/errors";
import { redisPlugin } from "@stock-platform/redis";
import { createLogger } from "@stock-platform/logger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { CandleRepository } from "./repositories/candle.repository.js";
import { LatestPriceRepository } from "./repositories/latest-price.repository.js";
import { TickRepository } from "./repositories/tick.repository.js";
import { candlesRoutes } from "./routes/candles.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { quotesRoutes } from "./routes/quotes.routes.js";
import { streamRoutes } from "./routes/stream.routes.js";
import { ticksRoutes } from "./routes/ticks.routes.js";
import { CandlesService } from "./services/candles.service.js";
import { ConnectionTrackerService } from "./services/connection-tracker.service.js";
import { HealthService } from "./services/health.service.js";
import { QuotesService } from "./services/quotes.service.js";
import { StreamSubscriptionService } from "./services/stream-subscription.service.js";
import { TicksService } from "./services/ticks.service.js";

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
    // Fastify's schema validation errors carry a `validation` array.
    if (error instanceof Error && "validation" in error && error.validation) {
      return reply.code(400).send({ error: error.message, code: "VALIDATION_ERROR" });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(redisPlugin, { url: config.REDIS_URL });
  // Tick history (M3, M6) and candles (M4) read the table the consumer writes.
  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });

  const latestPriceRepository = new LatestPriceRepository(app.redis);
  const quotesService = new QuotesService(latestPriceRepository);
  const streamSubscriptionService = new StreamSubscriptionService(
    app.redis,
    latestPriceRepository,
  );
  const connectionTracker = new ConnectionTrackerService();
  const ticksService = new TicksService(new TickRepository(app.db));
  const candlesService = new CandlesService(new CandleRepository(app.db));
  const healthService = new HealthService(app.redis);

  await app.register(healthRoutes, { healthService, connectionTracker });
  await app.register(quotesRoutes, { quotesService });
  await app.register(ticksRoutes, { ticksService });
  await app.register(candlesRoutes, { candlesService });
  await app.register(streamRoutes, { connectionTracker, log, streamSubscriptionService });

  return app;
}
