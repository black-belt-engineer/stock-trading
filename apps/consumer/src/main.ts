import { Redis } from "ioredis";
import { Pool } from "pg";
import type { PriceEvent } from "@stock-platform/types";
import {
  prepareDatabase,
  sideToSmallInt,
  upsertRedisLatest,
} from "./market-data-persistence.js";
import { setupKafkaConsumer } from "./kafka.js";
import { createServer, getServerConfig, registerHealthRoute } from "./server.js";
import type { HealthStatus } from "./types.js";
import { loadLocalEnv, log } from "./utils.js";

export async function main(): Promise<void> {
  loadLocalEnv();

  const fastify = await createServer();
  const config = getServerConfig(fastify);
  const { DATABASE_URL, REDIS_URL, PORT, KAFKA_TOPIC } = config;

  const pool = new Pool({ connectionString: DATABASE_URL });
  await prepareDatabase(pool);

  const redis = new Redis(REDIS_URL);
  const { consumer } = await setupKafkaConsumer(config);

  let health: HealthStatus = {
    status: "starting",
    messagesProcessed: 0,
    lastMessageAt: null,
  };
  let shuttingDown = false;

  consumer.on("consumer.crash", (ev) => {
    log.error({ ev }, "Kafka consumer crashed");
  });

  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  void consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      let event: PriceEvent;
      try {
        event = JSON.parse(message.value.toString()) as PriceEvent;
      } catch (err) {
        log.error({ err }, "Failed to parse Kafka message");
        return;
      }

      try {
        const postgresWrite = pool.query(
          `
          INSERT INTO stock_ticks (time, symbol, price, size, side)
          VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5)
        `,
          [
            event.timestamp,
            event.symbol,
            event.price,
            event.size,
            sideToSmallInt(event.side),
          ],
        );
        const redisWrite = upsertRedisLatest(redis, event);

        await Promise.all([postgresWrite, redisWrite]);

        health = {
          status: "healthy",
          messagesProcessed: health.messagesProcessed + 1,
          lastMessageAt: Date.now(),
        };
      } catch (err) {
        log.error({ err }, "Failed to process message");
        throw err;
      }
    },
  });

  registerHealthRoute(fastify, () => health);

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  log.info({ port: PORT }, "Consumer HTTP server listening");

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, "Shutting down consumer");

    await consumer.disconnect();
    await fastify.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
