import Fastify, { type FastifyInstance } from "fastify";
import fastifyEnv from "@fastify/env";
import type { AppEnv } from "./types.js";

const envSchema = {
  type: "object",
  required: ["PUBSUB_PROJECT_ID", "PUBSUB_TOPIC"],
  properties: {
    PUBSUB_PROJECT_ID: { type: "string", minLength: 1 },
    PUBSUB_TOPIC: { type: "string", minLength: 1 },
    PUBSUB_EMULATOR_HOST: { type: "string" },
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
