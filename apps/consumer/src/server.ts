import Fastify, { type FastifyInstance } from "fastify";
import fastifyEnv from "@fastify/env";
import type { AppEnv, HealthStatus } from "./types.js";

const envSchema = {
  type: "object",
  required: ["KAFKA_BROKERS", "DATABASE_URL", "REDIS_URL"],
  properties: {
    KAFKA_BROKERS: { type: "string", minLength: 1 },
    KAFKA_TOPIC: { type: "string", default: "stock-prices" },
    KAFKA_GROUP_ID: { type: "string", default: "stock-prices-consumer" },
    KAFKA_CLIENT_ID: { type: "string", default: "consumer" },
    KAFKA_TOPIC_PARTITIONS: { type: "number", default: 6 },
    KAFKA_REPLICATION_FACTOR: { type: "number", default: 1 },
    DATABASE_URL: { type: "string", minLength: 1 },
    REDIS_URL: { type: "string", minLength: 1 },
    PORT: { type: "number", default: 3002 },
  },
} as const;

type ConsumerServer = FastifyInstance & { config: AppEnv };

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
  return (fastify as unknown as ConsumerServer).config;
}

export function registerHealthRoute(
  fastify: FastifyInstance,
  getHealth: () => HealthStatus,
): void {
  fastify.get("/health", async () => getHealth());
}
