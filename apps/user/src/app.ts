import { dbPlugin } from "@stock-platform/db";
import { isAppError } from "@stock-platform/errors";
import { createLogger } from "@stock-platform/logger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/index.js";
import { UserRepository } from "./repositories/user.repository.js";
import { createJwtGuard } from "./plugins/jwt-guard.js";
import { healthRoutes } from "./routes/health.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { HealthService } from "./services/health.service.js";
import { UserService } from "./services/user.service.js";

export type UserApp = { app: FastifyInstance; userService: UserService };

export async function buildApp(config: AppConfig): Promise<UserApp> {
  const log = createLogger("user", { level: config.LOG_LEVEL, environment: config.NODE_ENV });

  const app = Fastify({ logger: false }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: Error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    // Fastify's schema validation errors carry a `validation` array.
    if ("validation" in error && error.validation) {
      return reply.code(400).send({ error: error.message, code: "VALIDATION_ERROR" });
    }
    log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({ error: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });

  const userService = new UserService(new UserRepository(app.db));
  const healthService = new HealthService(app.db);

  await app.register(healthRoutes, { healthService });
  await app.register(userRoutes, {
    userService,
    jwtGuard: createJwtGuard({
      jwksUrl: new URL("/.well-known/jwks.json", config.AUTH_SERVICE_URL),
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    }),
  });

  return { app, userService };
}
