import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import { redisPlugin } from "@stock-platform/redis";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { SessionRepository } from "./repositories/session.repository.js";
import { healthRoutes } from "./routes/health.routes.js";
import { HealthService } from "./services/health.service.js";
import { discoverOidc } from "./services/oidc.service.js";
import { SessionCrypto } from "./services/session-crypto.js";

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

  const oidc = await discoverOidc({
    issuerUrl: config.KEYCLOAK_ISSUER_URL,
    internalUrl: config.KEYCLOAK_INTERNAL_URL,
    clientId: config.KC_BFF_CLIENT_ID,
    clientSecret: config.KC_BFF_CLIENT_SECRET,
  });
  log.info({ issuer: oidc.serverMetadata().issuer }, "OIDC discovery done");

  await app.register(redisPlugin, { url: config.REDIS_URL });
  // Built here so a bad key stops the start; the routes of commits 19 to 25 will take it.
  new SessionRepository(app.redis, new SessionCrypto(config.SESSION_ENCRYPTION_KEY));
  await app.register(healthRoutes, { healthService: new HealthService(app.redis) });

  return app;
}
