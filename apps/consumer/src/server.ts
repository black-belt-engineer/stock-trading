import "./fastify-env.js";
import type { AppEnv, HealthStatus } from "./types.js";
import { kafkaEnvSchemaProperties } from "@stock-platform/kafka";
import fastifyEnv from "@fastify/env";
import Fastify, { type FastifyInstance } from "fastify";

const envSchema = {
  type: "object",
  required: ["KAFKA_BROKERS", "DATABASE_URL", "REDIS_URL"],
  properties: {
    ...kafkaEnvSchemaProperties("consumer"),
    KAFKA_GROUP_ID: { type: "string", default: "stock-prices-consumer" },
    DATABASE_URL: { type: "string", minLength: 1 },
    REDIS_URL: { type: "string", minLength: 1 },
    PORT: { type: "number", default: 3002 },
  },
} as const;

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: envSchema,
    dotenv: false,
  });

  return fastify;
}

export function getServerConfig(fastify: FastifyInstance): AppEnv {
  return fastify.config;
}

export function registerHealthRoute(
  fastify: FastifyInstance,
  getHealth: () => HealthStatus,
): void {
  fastify.get("/health", async () => getHealth());
}
