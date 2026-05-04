import { PubSub } from "@google-cloud/pubsub";
import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@stock-platform/logger";
import type { PriceEvent } from "@stock-platform/types";

const log = createLogger("ingestor");

const SYMBOL_CONFIG = [
  { symbol: "AAPL", name: "Apple Inc.", seed: 228.5 },
  { symbol: "TSLA", name: "Tesla, Inc.", seed: 248.0 },
  { symbol: "GOOGL", name: "Alphabet Inc.", seed: 175.2 },
  { symbol: "MSFT", name: "Microsoft Corporation", seed: 418.0 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", seed: 198.5 },
  { symbol: "NVDA", name: "NVIDIA Corporation", seed: 124.0 },
] as const;

const STAGGER_MS = 200;
const TICK_INTERVAL_MS = 1000;
const RANDOM_WALK = 0.005;

type AppEnv = {
  PUBSUB_PROJECT_ID: string;
  PUBSUB_TOPIC: string;
  PUBSUB_EMULATOR_HOST?: string;
  PORT: number;
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

function randomWalkMultiplier(): number {
  return 1 + (Math.random() * 2 * RANDOM_WALK - RANDOM_WALK);
}

function buildPriceEvent(
  row: (typeof SYMBOL_CONFIG)[number],
  previousPrice: number,
  nextPrice: number,
): PriceEvent {
  const changePercent =
    previousPrice === 0
      ? 0
      : ((nextPrice - previousPrice) / previousPrice) * 100;

  const volume = Math.floor(5000 + Math.random() * 450_000);
  const size = Math.floor(1 + Math.random() * 500);
  const side: "buy" | "sell" = Math.random() < 0.5 ? "buy" : "sell";

  return {
    symbol: row.symbol,
    name: row.name,
    price: nextPrice,
    previousPrice,
    changePercent,
    volume,
    timestamp: Date.now(),
    source: "fake",
    size,
    side,
    exchange: "NASDAQ",
    conditions: [],
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: {
      type: "object",
      required: ["PUBSUB_PROJECT_ID", "PUBSUB_TOPIC"],
      properties: {
        PUBSUB_PROJECT_ID: { type: "string", minLength: 1 },
        PUBSUB_TOPIC: { type: "string", minLength: 1 },
        PUBSUB_EMULATOR_HOST: { type: "string" },
        PORT: { type: "number", default: 3001 },
      },
    },
    dotenv: false,
  });

  const { PUBSUB_PROJECT_ID, PUBSUB_TOPIC, PUBSUB_EMULATOR_HOST, PORT } =
    (fastify as typeof fastify & { config: AppEnv }).config;

  if (PUBSUB_EMULATOR_HOST) {
    log.info(
      { pubsubEmulatorHost: PUBSUB_EMULATOR_HOST },
      "Using Pub/Sub emulator",
    );
  }

  const pubsub = new PubSub({ projectId: PUBSUB_PROJECT_ID });
  const topic = pubsub.topic(PUBSUB_TOPIC);
  const [topicExists] = await topic.exists();
  if (!topicExists) {
    await topic.create();
    log.info({ topic: PUBSUB_TOPIC }, "Created Pub/Sub topic");
  }

  const previousPrices = new Map<string, number>();
  for (const row of SYMBOL_CONFIG) {
    previousPrices.set(row.symbol, row.seed);
  }

  let tickCount = 0;
  const pending = new Set<Promise<unknown>>();
  let shuttingDown = false;

  fastify.get("/health", async () => ({
    status: "ok" as const,
    tickCount,
  }));

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  log.info({ port: PORT }, "HTTP server listening");

  async function publishForSymbol(
    row: (typeof SYMBOL_CONFIG)[number],
  ): Promise<void> {
    if (shuttingDown) {
      return;
    }

    const previousPrice = previousPrices.get(row.symbol) ?? row.seed;
    const rawNext = previousPrice * randomWalkMultiplier();
    const nextPrice = Math.round(rawNext * 100) / 100;

    previousPrices.set(row.symbol, nextPrice);

    const event: PriceEvent = buildPriceEvent(row, previousPrice, nextPrice);

    const publishPromise = topic
      .publishMessage({ json: event })
      .then((messageId) => {
        tickCount += 1;
        log.debug({ symbol: row.symbol, messageId }, "Published tick");
      })
      .catch((err: unknown) => {
        log.error({ err, symbol: row.symbol }, "Failed to publish tick");
      });

    pending.add(publishPromise);
    void publishPromise.finally(() => {
      pending.delete(publishPromise);
    });
  }

  const intervals: ReturnType<typeof setInterval>[] = [];

  for (let i = 0; i < SYMBOL_CONFIG.length; i += 1) {
    const row = SYMBOL_CONFIG[i]!;
    const delayMs = i * STAGGER_MS;

    const timeout = setTimeout(() => {
      void publishForSymbol(row);
      const interval = setInterval(() => {
        void publishForSymbol(row);
      }, TICK_INTERVAL_MS);
      intervals.push(interval);
    }, delayMs);

  }

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, "Shutting down");

    for (const id of intervals) {
      clearInterval(id);
    }

    await fastify.close();
    log.info("HTTP server closed");

    const toFlush = [...pending];
    await Promise.all(toFlush);
    log.info({ flushed: toFlush.length }, "Pending publishes settled");

    await pubsub.close();
    log.info("Pub/Sub client closed");

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
