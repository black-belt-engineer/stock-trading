import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";
import { kafkaBrokerEnvSchema } from "@stock-platform/kafka";

const schema = Type.Composite([
  kafkaBrokerEnvSchema("ingestor"),
  Type.Object({
    REDIS_URL: Type.String({ minLength: 1 }),
    PORT: Type.Integer({ minimum: 1, default: 3001 }),
    LOG_LEVEL: Type.String({ default: "info" }),
    NODE_ENV: Type.String({ default: "development" }),
  }),
]);

export type AppConfig = Static<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (!cached) {
    cached = parseEnv(schema);
  }
  return cached;
}
