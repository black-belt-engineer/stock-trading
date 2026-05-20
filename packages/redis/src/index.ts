import "./fastify-augment.js";

export { createRedisClient, closeRedisClient, pingRedis } from "./client.js";
export { redisPlugin, type RedisPluginOptions } from "./plugin.js";
