import { createJwtGuard } from "@stock-platform/auth-guard";
import { dbPlugin } from "@stock-platform/db";
import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import { redisPlugin } from "@stock-platform/redis";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { AlertRepository } from "./repositories/alert.repository.js";
import { TradingRepository } from "./repositories/trading.repository.js";
import { UserDataRepository } from "./repositories/user-data.repository.js";
import { WatchlistRepository } from "./repositories/watchlist.repository.js";
import { migrate } from "./migrations.js";
import { STARTING_CASH_CENTS } from "./models/trading.js";
import { alertRoutes } from "./routes/alert.routes.js";
import { tradingRoutes } from "./routes/trading.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { watchlistRoutes } from "./routes/watchlist.routes.js";
import { AlertService } from "./services/alert.service.js";
import { CleanupService, scheduleDaily } from "./services/cleanup.service.js";
import { HealthService } from "./services/health.service.js";
import { IdentityEventsService } from "./services/identity-events.service.js";
import { KeycloakUsers } from "./services/keycloak-users.js";
import { PriceReader } from "./services/price-reader.js";
import { TradingService } from "./services/trading.service.js";
import { WatchlistService } from "./services/watchlist.service.js";

/**
 * The portfolio service (Q4): per-user data for the watchlist (P1), price alerts (P2) and
 * paper trading (P3). The browser reaches it only through the BFF, which adds the bearer token.
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
  // Latest prices (`price:latest:<symbol>`): paper trading fills orders at them (P3).
  await app.register(redisPlugin, { url: config.REDIS_URL });

  // Ordered migrations (`apps/portfolio/migrations`) before anything touches a table. A failed
  // or refused migration stops the start: the money tables must never run on an unknown schema.
  const applied = await migrate(app.db, { info: (message) => log.info(message) });
  log.info({ applied }, "Schema ready");

  const watchlistRepository = new WatchlistRepository(app.db);
  const alertRepository = new AlertRepository(app.db);
  const tradingRepository = new TradingRepository(app.db, STARTING_CASH_CENTS);

  const watchlistService = new WatchlistService(watchlistRepository);
  const alertService = new AlertService(alertRepository);
  const tradingService = new TradingService(tradingRepository, new PriceReader(app.redis), log);
  const userData = new UserDataRepository(app.db, watchlistRepository, alertRepository, tradingRepository);

  // K6: account deletions in Keycloak reach this service through Kafka, and a nightly job
  // removes whatever that missed. Neither blocks the start: the API works without them.
  const identityEvents = new IdentityEventsService({
    brokers: config.KAFKA_BROKERS,
    topic: config.IDENTITY_EVENTS_TOPIC,
    groupId: config.IDENTITY_EVENTS_GROUP_ID,
    deleteUser: (userId) => userData.deleteUser(userId),
    log,
  });
  identityEvents.start();
  app.addHook("onClose", async () => {
    await identityEvents.stop();
  });
  const cleanup = createCleanup(config, userData, log);
  if (cleanup) {
    const stop = scheduleDaily(config.CLEANUP_HOUR_UTC, () => cleanup.run(), log);
    app.addHook("onClose", async () => stop());
  } else {
    log.warn("KC_PORTFOLIO_CLIENT_SECRET is not set: no nightly cleanup of deleted users");
  }
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
    await protectedScope.register(alertRoutes, { alertService });
    await protectedScope.register(tradingRoutes, { tradingService });
  });

  return app;
}

/** The nightly cleanup, or `null` without the service account's secret. */
export function createCleanup(
  config: AppConfig,
  userData: UserDataRepository,
  log: ReturnType<typeof createLogger>,
): CleanupService | null {
  if (config.KC_PORTFOLIO_CLIENT_SECRET === "") return null;
  const users = new KeycloakUsers({
    realmUrl: config.KEYCLOAK_INTERNAL_URL,
    clientId: config.KC_PORTFOLIO_CLIENT_ID,
    clientSecret: config.KC_PORTFOLIO_CLIENT_SECRET,
  });
  return new CleanupService(userData, users, log);
}
