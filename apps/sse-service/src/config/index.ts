import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";

const schema = Type.Object({
  REDIS_URL: Type.String({ minLength: 1 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  /** Where the guard fetches the public keys: Keycloak's certs URL, on its internal address. */
  JWKS_URL: Type.String({ default: "http://localhost:8180/realms/stock-platform/protocol/openid-connect/certs" }),
  /** Keycloak's issuer, the `KC_HOSTNAME` URL (what is in the token's `iss`). */
  JWT_ISSUER: Type.String({ default: "http://localhost:5173/realms/stock-platform" }),
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
