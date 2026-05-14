import type { AppEnv } from "./types.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppEnv;
  }
}

export {};
