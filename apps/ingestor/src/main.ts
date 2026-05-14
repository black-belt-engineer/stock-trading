import type { PriceEvent } from "@stock-platform/types";
import { SYMBOL_CONFIG, STAGGER_MS, TICK_INTERVAL_MS } from "./constants.js";
import { buildPriceEvent, calculateNextPrice } from "./price-event-factory.js";
import { publishPriceEvent, setupKafkaProducer } from "./kafka.js";
import { createServer, getServerConfig, registerHealthRoute } from "./server.js";
import { loadLocalEnv, log } from "./utils.js";

export async function main(): Promise<void> {
  loadLocalEnv();

  const fastify = await createServer();
  const config = getServerConfig(fastify);
  const { PORT, KAFKA_TOPIC } = config;
  const { producer } = await setupKafkaProducer(config);

  const previousPrices = new Map<string, number>();
  for (const row of SYMBOL_CONFIG) {
    previousPrices.set(row.symbol, row.seed);
  }

  let tickCount = 0;
  let shuttingDown = false;
  const pending = new Set<Promise<unknown>>();
  const intervals: ReturnType<typeof setInterval>[] = [];
  const startupTimeouts: ReturnType<typeof setTimeout>[] = [];

  registerHealthRoute(fastify, () => tickCount);

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  log.info({ port: PORT }, "HTTP server listening");

  async function publishForSymbol(
    row: (typeof SYMBOL_CONFIG)[number],
  ): Promise<void> {
    if (shuttingDown) {
      return;
    }

    const previousPrice = previousPrices.get(row.symbol) ?? row.seed;
    const nextPrice = calculateNextPrice(previousPrice);
    previousPrices.set(row.symbol, nextPrice);

    const event: PriceEvent = buildPriceEvent(row, previousPrice, nextPrice);
    const publishPromise = publishPriceEvent(producer, KAFKA_TOPIC, event)
      .then(() => {
        tickCount += 1;
        log.debug({ symbol: row.symbol }, "Published tick");
      })
      .catch((err: unknown) => {
        log.error({ err, symbol: row.symbol }, "Failed to publish tick");
      });

    pending.add(publishPromise);
    void publishPromise.finally(() => {
      pending.delete(publishPromise);
    });
  }

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

    startupTimeouts.push(timeout);
  }

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, "Shutting down");

    for (const id of startupTimeouts) {
      clearTimeout(id);
    }
    for (const id of intervals) {
      clearInterval(id);
    }

    await fastify.close();
    log.info("HTTP server closed");

    const toFlush = [...pending];
    await Promise.all(toFlush);
    log.info({ flushed: toFlush.length }, "Pending publishes settled");

    await producer.disconnect();
    log.info("Kafka producer disconnected");

    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
