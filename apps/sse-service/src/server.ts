import "./fastify-env.js";
import type { AppEnv } from "./types.js";
import fastifyEnv from "@fastify/env";
import Fastify, { type FastifyInstance } from "fastify";

const envSchema = {
  type: "object",
  required: ["REDIS_URL"],
  properties: {
    REDIS_URL: { type: "string", minLength: 1 },
    PORT: { type: "number", default: 3003 },
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
