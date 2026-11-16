import "./fastify-augment.js";

export { createRedisClient, closeRedisClient, pingRedis } from "./client.js";
export { redisPlugin, type RedisPluginOptions } from "./plugin.js";
export { FixedWindowCounter, type FixedWindowOptions, type WindowState } from "./fixed-window.js";
