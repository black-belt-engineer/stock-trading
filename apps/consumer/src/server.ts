import { loadLocalEnv } from "@stock-platform/env";
import { createLogger } from "@stock-platform/logger";
import { loadConfig } from "./config/index.js";
import { buildApp } from "./app.js";
import { MarketDataService } from "./services/market-data.service.js";
import { KafkaConsumerService } from "./services/kafka-consumer.service.js";

const bootstrapLog = createLogger("consumer");

loadLocalEnv({ importMetaUrl: import.meta.url, log: bootstrapLog });

async function start(): Promise<void> {
  const config = loadConfig();
  const log = createLogger("consumer", {
    level: config.LOG_LEVEL,
    environment: config.NODE_ENV,
  });

  const { app, healthService } = await buildApp(config);

  const marketDataService = new MarketDataService(app.db, app.redis, log);
  await marketDataService.initialize();

  const kafkaConsumerService = new KafkaConsumerService(config, log);
  const consumer = await kafkaConsumerService.connect();

  void kafkaConsumerService.subscribeAndRun(consumer, async (event) => {
    try {
      await marketDataService.persistPriceEvent(event);
      healthService.recordMessageProcessed();
    } catch (err) {
      log.error({ err }, "Failed to process message");
      throw err;
    }
  });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "Consumer HTTP server listening");

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    log.info({ signal }, "Shutting down consumer");
    await kafkaConsumerService.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((err: unknown) => {
  bootstrapLog.error({ err }, "Fatal error");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  bootstrapLog.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  bootstrapLog.error({ reason }, "Unhandled rejection");
  process.exit(1);
});
