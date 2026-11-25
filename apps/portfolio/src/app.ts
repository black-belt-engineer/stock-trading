import { createJwtGuard } from "@stock-platform/auth-guard";
import { dbPlugin } from "@stock-platform/db";
import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import { redisPlugin } from "@stock-platform/redis";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { WatchlistRepository } from "./repositories/watchlist.repository.js";
import { healthRoutes } from "./routes/health.routes.js";
import { watchlistRoutes } from "./routes/watchlist.routes.js";
import { HealthService } from "./services/health.service.js";
import { WatchlistService } from "./services/watchlist.service.js";

/**
 * The portfolio service (Q4): per-user data for the watchlist (P1), later alerts (P2) and paper
 * trading (P3). The browser reaches it only through the BFF, which adds the bearer token.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const log = createLogger("portfolio", {
    level: config.LOG_LEVEL,
    environment: config.NODE_ENV,
  });

  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    // Fastify's schema validation errors carry a `validation` array.
    if (error instanceof Error && "validation" in error && error.validation) {
      return reply.code(400).send({ error: error.message, code: "VALIDATION_ERROR" });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });
  // Latest prices (`price:latest:<symbol>`) are read from here once paper trading exists (P3).
  await app.register(redisPlugin, { url: config.REDIS_URL });

  const watchlistRepository = new WatchlistRepository(app.db);
  await watchlistRepository.prepareSchema();
  log.info("Schema ready");

  const watchlistService = new WatchlistService(watchlistRepository);
  const healthService = new HealthService(app.db, app.redis);

  const jwtGuard = createJwtGuard({
    jwksUrl: new URL(config.JWKS_URL),
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  // Probes stay open.
  await app.register(healthRoutes, { healthService });

  // Everything else needs a valid access token; the routes use fastify-plugin, so they join
  // this scope and its hook.
  await app.register(async (protectedScope) => {
    protectedScope.addHook("preHandler", jwtGuard);
    await protectedScope.register(watchlistRoutes, { watchlistService });
  });

  return app;
}
