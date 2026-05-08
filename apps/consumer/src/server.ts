import Fastify, { type FastifyInstance } from "fastify";
import fastifyEnv from "@fastify/env";
import type { AppEnv, HealthStatus } from "./types.js";

const envSchema = {
  type: "object",
  required: [
    "PUBSUB_PROJECT_ID",
    "PUBSUB_SUBSCRIPTION",
    "DATABASE_URL",
    "REDIS_URL",
  ],
  properties: {
    PUBSUB_PROJECT_ID: { type: "string", minLength: 1 },
    PUBSUB_TOPIC: { type: "string", default: "stock-prices" },
    PUBSUB_SUBSCRIPTION: { type: "string", minLength: 1 },
    DATABASE_URL: { type: "string", minLength: 1 },
    REDIS_URL: { type: "string", minLength: 1 },
    PUBSUB_EMULATOR_HOST: { type: "string" },
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
