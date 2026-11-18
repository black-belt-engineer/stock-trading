import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";

const schema = Type.Object({
  REDIS_URL: Type.String({ minLength: 1 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  /** Where the guard fetches the public keys. Default: the auth service; K5 points it at Keycloak's certs URL. */
  JWKS_URL: Type.String({ default: "http://localhost:3005/.well-known/jwks.json" }),
  JWT_ISSUER: Type.String({ default: "stock-auth" }),
  JWT_AUDIENCE: Type.String({ default: "stock-platform" }),
  PORT: Type.Integer({ minimum: 1, default: 3003 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  NODE_ENV: Type.String({ default: "development" }),
});

export type AppConfig = Static<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (!cached) {
    cached = parseEnv(schema);
  }
  return cached;
}
