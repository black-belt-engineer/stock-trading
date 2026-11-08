import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";

const schema = Type.Object({
  REDIS_URL: Type.String({ minLength: 1 }),
  USER_SERVICE_URL: Type.String({ default: "http://localhost:3004" }),
  /** ES256 private key, PKCS8 PEM. Literal `\n` sequences are accepted. Generate with `pnpm keys:generate`. */
  JWT_PRIVATE_KEY: Type.String({ minLength: 1 }),
  JWT_ISSUER: Type.String({ default: "stock-auth" }),
  JWT_AUDIENCE: Type.String({ default: "stock-platform" }),
  ACCESS_TOKEN_TTL_SECONDS: Type.Integer({ minimum: 1, default: 600 }),
  REFRESH_TOKEN_TTL_SECONDS: Type.Integer({ minimum: 1, default: 604800 }),
  PORT: Type.Integer({ minimum: 1, default: 3005 }),
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
