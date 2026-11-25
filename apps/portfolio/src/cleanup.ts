/**
 * Runs the nightly cleanup once, now (K6): `pnpm --filter @stock-platform/portfolio cleanup`.
 * Prints how many users were checked and how many removed; exits 1 when Keycloak could not be
 * asked, in which case nothing was deleted.
 */
import { createPool, closePool } from "@stock-platform/db";
import { loadLocalEnv } from "@stock-platform/env";
import { createLogger } from "@stock-platform/logger";
import { createCleanup } from "./app.js";
import { loadConfig } from "./config/index.js";
import { AlertRepository } from "./repositories/alert.repository.js";
import { TradingRepository } from "./repositories/trading.repository.js";
import { STARTING_CASH_CENTS } from "./models/trading.js";
import { UserDataRepository } from "./repositories/user-data.repository.js";
import { WatchlistRepository } from "./repositories/watchlist.repository.js";
import { migrate } from "./migrations.js";

const log = createLogger("portfolio-cleanup");
loadLocalEnv({ importMetaUrl: import.meta.url, log });
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
try {
  await migrate(pool, { info: (message) => log.info(message) });
  const watchlist = new WatchlistRepository(pool);
  const alerts = new AlertRepository(pool);
  const cleanup = createCleanup(config, new UserDataRepository(pool, watchlist, alerts, new TradingRepository(pool, STARTING_CASH_CENTS)), log);
  if (!cleanup) {
    log.error("KC_PORTFOLIO_CLIENT_SECRET is not set");
    process.exitCode = 1;
  } else {
    const result = await cleanup.run();
    console.log(JSON.stringify(result));
  }
} catch (err) {
  log.error({ err }, "Cleanup failed; nothing was deleted");
  process.exitCode = 1;
} finally {
  await closePool(pool);
}
