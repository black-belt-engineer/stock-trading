import { PubSub } from "@google-cloud/pubsub";
import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@stock-platform/logger";
import type { LatestPrice, PriceEvent } from "@stock-platform/types";

const log = createLogger("consumer");

type AppEnv = {
  PUBSUB_PROJECT_ID: string;
  PUBSUB_TOPIC?: string;
  PUBSUB_SUBSCRIPTION: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  PUBSUB_EMULATOR_HOST?: string;
  PORT: number;
};

type HealthStatus = {
  status: "starting" | "healthy";
  messagesProcessed: number;
  lastMessageAt: number | null;
};

function loadLocalEnv(): void {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(moduleDir, "../../.env.local"),
    resolve(moduleDir, "../../../.env.local"),
  ];

  for (const path of candidates) {
    const result = dotenv.config({ path, override: false });
    if (!result.error) {
      log.info({ path }, "Loaded environment file");
      return;
    }
  }
}

function sideToSmallInt(side: PriceEvent["side"]): number {
  return side === "buy" ? 1 : -1;
}

async function upsertRedisLatest(
  redis: Redis,
  event: PriceEvent,
): Promise<void> {
  const key = `price:latest:${event.symbol}`;
  const existingRaw = await redis.get(key);
  const previous: LatestPrice | null = existingRaw
    ? (JSON.parse(existingRaw) as LatestPrice)
    : null;

  const currentPrice = event.price;
  const previousPrice = previous?.currentPrice ?? event.previousPrice;
  const changeValue = currentPrice - previousPrice;
  const changePercent =
    previousPrice === 0 ? 0 : (changeValue / previousPrice) * 100;

  const latest: LatestPrice = {
    symbol: event.symbol,
    name: event.name,
    currentPrice,
    previousPrice,
    changeValue,
    changePercent,
    high24h: previous ? Math.max(previous.high24h, currentPrice) : currentPrice,
    low24h: previous ? Math.min(previous.low24h, currentPrice) : currentPrice,
    volume24h: (previous?.volume24h ?? 0) + event.size,
    lastUpdated: event.timestamp,
  };

  const sparklineKey = `price:sparkline:${event.symbol}`;
  const score = event.timestamp;
  // Keep exactly the last 30 ticks by rank.
  await redis
    .multi()
    .set(key, JSON.stringify(latest))
    .zadd(sparklineKey, score, String(currentPrice))
    .zremrangebyrank(sparklineKey, 0, -31)
    .exec();
}

async function prepareDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_ticks (
      time TIMESTAMPTZ NOT NULL,
      symbol TEXT NOT NULL,
      price DOUBLE PRECISION,
      size NUMERIC,
      side SMALLINT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS stock_ticks_symbol_time_idx
      ON stock_ticks (symbol, time DESC);
  `);

  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb;");
  } catch (err) {
    log.warn({ err }, "TimescaleDB extension unavailable, using regular table");
    return;
  }

  try {
    await pool.query(`
      SELECT create_hypertable('stock_ticks', 'time', if_not_exists => TRUE, migrate_data => TRUE);
    `);
    log.info("stock_ticks configured as Timescale hypertable");
  } catch (err) {
    log.warn({ err }, "Could not configure hypertable, using regular table");
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  const fastify = Fastify({ logger: false });
  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: {
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
    },
    dotenv: false,
  });

  const {
    PUBSUB_PROJECT_ID,
    PUBSUB_TOPIC,
    PUBSUB_SUBSCRIPTION,
    DATABASE_URL,
    REDIS_URL,
    PUBSUB_EMULATOR_HOST,
    PORT,
  } = (fastify as typeof fastify & { config: AppEnv }).config;

  if (PUBSUB_EMULATOR_HOST) {
    log.info(
      { pubsubEmulatorHost: PUBSUB_EMULATOR_HOST },
      "Using Pub/Sub emulator",
    );
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  await prepareDatabase(pool);
  const redis = new Redis(REDIS_URL);

  const pubsub = new PubSub({ projectId: PUBSUB_PROJECT_ID });
  const subscription = pubsub.subscription(PUBSUB_SUBSCRIPTION);
  const [subscriptionExists] = await subscription.exists();
  if (!subscriptionExists) {
    const topicName = PUBSUB_TOPIC ?? "stock-prices";
    const topic = pubsub.topic(topicName);
    const [topicExists] = await topic.exists();
    if (!topicExists) {
      await topic.create();
      log.info({ topic: topicName }, "Created Pub/Sub topic");
    }
    await topic.createSubscription(PUBSUB_SUBSCRIPTION);
    log.info({ subscription: PUBSUB_SUBSCRIPTION }, "Created Pub/Sub subscription");
  }

  let health: HealthStatus = {
    status: "starting",
    messagesProcessed: 0,
    lastMessageAt: null,
  };
  let shuttingDown = false;

  subscription.on("error", (err) => {
    log.error({ err }, "Pub/Sub subscription error");
  });

  subscription.on("message", (message) => {
    const processMessage = async (): Promise<void> => {
      const event = JSON.parse(message.data.toString()) as PriceEvent;

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
      message.ack();

      health = {
        status: "healthy",
        messagesProcessed: health.messagesProcessed + 1,
        lastMessageAt: Date.now(),
      };
    };

    void processMessage().catch((err: unknown) => {
      log.error({ err }, "Failed to process message");
      message.nack();
    });
  });

  fastify.get("/health", async () => health);

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  log.info({ port: PORT }, "Consumer HTTP server listening");

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, "Shutting down consumer");

    subscription.removeAllListeners();
    await fastify.close();
    await redis.quit();
    await pool.end();
    await pubsub.close();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((err: unknown) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
