import "./fastify-env.js";
import type { AppEnv } from "./types.js";
import { kafkaEnvSchemaProperties } from "@stock-platform/kafka";
import fastifyEnv from "@fastify/env";
import Fastify, { type FastifyInstance } from "fastify";

const envSchema = {
  type: "object",
  required: ["KAFKA_BROKERS"],
  properties: {
    ...kafkaEnvSchemaProperties("ingestor"),
    PORT: { type: "number", default: 3001 },
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
  return fastify.config;
}
