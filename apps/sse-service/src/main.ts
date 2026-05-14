import { registerShutdownHandlers } from "@stock-platform/env";
import { Redis } from "ioredis";
import { registerRoutes } from "./routes.js";
import { createServer, getServerConfig } from "./server.js";
import { loadLocalEnv, log } from "./utils.js";

export async function main(): Promise<void> {
  loadLocalEnv();

  const fastify = await createServer();
  const config = getServerConfig(fastify);
  const redis = new Redis(config.REDIS_URL);

  let activeConnections = 0;

  registerRoutes(fastify, {
    redis,
    getActiveConnections: () => activeConnections,
    incrementConnections: () => {
      activeConnections += 1;
    },
    decrementConnections: () => {
      activeConnections = Math.max(0, activeConnections - 1);
    },
  });

  await fastify.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "SSE service listening");

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    log.info({ signal }, "Shutting down SSE service");
    await fastify.close();
    await redis.quit();
    process.exit(0);
  }

  registerShutdownHandlers({ onShutdown: shutdown });
}
