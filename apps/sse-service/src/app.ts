import { createJwtGuard } from "@stock-platform/auth-guard";
import { dbPlugin } from "@stock-platform/db";
import { isAppError } from "@stock-platform/errors";
import { redisPlugin } from "@stock-platform/redis";
import { createLogger } from "@stock-platform/logger";
import { PRICE_UPDATES_STREAM_KEY, streamQuoteFromLatest, type StreamQuote } from "@stock-platform/types";
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
import { HealthService } from "./services/health.service.js";
import { QuotesService } from "./services/quotes.service.js";
import { createRedisStreamReader } from "./services/redis-stream-reader.js";
import { StreamHub } from "./services/stream-hub.service.js";
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
  // One Redis reader for every open stream (S2).
  const streamHub = new StreamHub({
    openReader: () => createRedisStreamReader(app.redis, PRICE_UPDATES_STREAM_KEY),
    loadQuotes: async (symbols) => {
      const quotes: StreamQuote[] = [];
      for (const symbol of symbols) {
        const latest = await latestPriceRepository.findBySymbol(symbol);
        if (latest) quotes.push(streamQuoteFromLatest(latest));
      }
      return quotes;
    },
    log,
  });
  // Open streams never end by themselves, so `server.close()` would wait for them forever. They are
  // ended before it, and the reader is closed before the Redis plugin quits the main connection.
  app.addHook("preClose", async () => {
    await streamHub.close();
  });
  const ticksService = new TicksService(new TickRepository(app.db));
  const candlesService = new CandlesService(new CandleRepository(app.db));
  const healthService = new HealthService(app.redis, streamHub);

  const jwtGuard = createJwtGuard({
    jwksUrl: new URL(config.JWKS_URL),
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  // Probes stay open.
  await app.register(healthRoutes, { healthService, streamHub });

  // Everything else sits behind login. The route plugins use fastify-plugin, so they join this
  // scope and its hook. A `preHandler` runs before the stream handler sends any SSE header, so a
  // rejected stream gets a normal JSON 401 or 503.
  await app.register(async (protectedScope) => {
    protectedScope.addHook("preHandler", jwtGuard);
    await protectedScope.register(quotesRoutes, { quotesService });
    await protectedScope.register(ticksRoutes, { ticksService });
    await protectedScope.register(candlesRoutes, { candlesService });
    await protectedScope.register(streamRoutes, { log, streamHub });
  });

  return app;
}
