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
  let shuttingDown = false;

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

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, "Shutting down SSE service");
    await fastify.close();
    await redis.quit();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
