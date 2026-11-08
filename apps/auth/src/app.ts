import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import { redisPlugin } from "@stock-platform/redis";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { RefreshTokenRepository } from "./repositories/refresh-token.repository.js";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { AuthService } from "./services/auth.service.js";
import { HealthService } from "./services/health.service.js";
import { TokenService } from "./services/token.service.js";
import { UserClientService } from "./services/user-client.service.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const log = createLogger("auth", { level: config.LOG_LEVEL, environment: config.NODE_ENV });

  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: Error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    if ((error as { validation?: unknown } | null)?.validation) {
      return reply.code(400).send({ error: error.message, code: "VALIDATION_ERROR" });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(redisPlugin, { url: config.REDIS_URL });

  const tokenService = await TokenService.create({
    privateKeyPem: config.JWT_PRIVATE_KEY,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });
  const authService = new AuthService(
    new UserClientService(config.USER_SERVICE_URL),
    tokenService,
    new RefreshTokenRepository(app.redis),
    {
      accessTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
    },
  );

  await app.register(healthRoutes, { healthService: new HealthService(app.redis) });
  await app.register(authRoutes, { authService, tokenService });

  return app;
}
