import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Redis } from "ioredis";
import { closeRedisClient, createRedisClient } from "./client.js";

export type RedisPluginOptions = {
  url: string;
};

const redisPluginImpl: FastifyPluginAsync<RedisPluginOptions> = async (fastify, opts) => {
  const redis = createRedisClient(opts.url);
  fastify.decorate("redis", redis);
  fastify.addHook("onClose", async () => {
    await closeRedisClient(redis);
  });
};

export const redisPlugin = fp(redisPluginImpl, { name: "redis" });
