import { loadLocalEnv } from "@stock-platform/env";
import { createLogger } from "@stock-platform/logger";
import { loadConfig } from "./config/index.js";
import { buildApp } from "./app.js";

const bootstrapLog = createLogger("auth");

loadLocalEnv({ importMetaUrl: import.meta.url, log: bootstrapLog });

async function start(): Promise<void> {
  const config = loadConfig();
  const log = createLogger("auth", { level: config.LOG_LEVEL, environment: config.NODE_ENV });

  const app = await buildApp(config);
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "Auth service listening");

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    log.info({ signal }, "Shutting down auth service");
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
