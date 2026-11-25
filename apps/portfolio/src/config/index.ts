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
  PORT: Type.Integer({ minimum: 1, default: 3006 }),
  /** The broker on the host (the same `KAFKA_BROKERS` the other apps use). */
  KAFKA_BROKERS: Type.String({ minLength: 1, default: "localhost:9092" }),
  /** K6: Keycloak's `stock-kafka` listener publishes account deletions here. */
  IDENTITY_EVENTS_TOPIC: Type.String({ default: "identity.events" }),
  IDENTITY_EVENTS_GROUP_ID: Type.String({ default: "portfolio-identity" }),
  /** The realm on Keycloak's internal address, for the nightly cleanup's user lookups. */
  KEYCLOAK_INTERNAL_URL: Type.String({ default: "http://localhost:8180/realms/stock-platform" }),
  KC_PORTFOLIO_CLIENT_ID: Type.String({ default: "stock-portfolio" }),
  /** Generated into `.env.local` by `scripts/dev.sh` and imported into the realm. Empty: no nightly cleanup. */
  KC_PORTFOLIO_CLIENT_SECRET: Type.String({ default: "" }),
  /** The hour (UTC) the nightly cleanup runs. */
  CLEANUP_HOUR_UTC: Type.Integer({ minimum: 0, maximum: 23, default: 3 }),
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
