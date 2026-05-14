import Fastify, { type FastifyInstance } from "fastify";
import fastifyEnv from "@fastify/env";
import type { AppEnv } from "./types.js";

const envSchema = {
  type: "object",
  required: ["KAFKA_BROKERS"],
  properties: {
    KAFKA_BROKERS: { type: "string", minLength: 1 },
    KAFKA_TOPIC: { type: "string", default: "stock-prices" },
    KAFKA_CLIENT_ID: { type: "string", default: "ingestor" },
    KAFKA_TOPIC_PARTITIONS: { type: "number", default: 6 },
    KAFKA_REPLICATION_FACTOR: { type: "number", default: 1 },
    PORT: { type: "number", default: 3001 },
  },
} as const;

export type IngestorServer = FastifyInstance & { config: AppEnv };

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: envSchema,
    dotenv: false,
  });

  return fastify;
}

export function registerHealthRoute(
  fastify: FastifyInstance,
  getTickCount: () => number,
): void {
  fastify.get("/health", async () => ({
    status: "ok" as const,
    tickCount: getTickCount(),
  }));
}

export function getServerConfig(fastify: FastifyInstance): AppEnv {
  return (fastify as unknown as IngestorServer).config;
}
