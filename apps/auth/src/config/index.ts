import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";

const schema = Type.Object({
  REDIS_URL: Type.String({ minLength: 1 }),
  USER_SERVICE_URL: Type.String({ default: "http://localhost:3004" }),
  JWT_SECRET: Type.String({ minLength: 32 }),
  JWT_EXPIRES_IN_SECONDS: Type.Integer({ minimum: 1, default: 3600 }),
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
