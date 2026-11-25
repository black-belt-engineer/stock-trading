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
import { UserDataRepository } from "./repositories/user-data.repository.js";
import { WatchlistRepository } from "./repositories/watchlist.repository.js";

const log = createLogger("portfolio-cleanup");
loadLocalEnv({ importMetaUrl: import.meta.url, log });
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
try {
  const watchlist = new WatchlistRepository(pool);
  await watchlist.prepareSchema();
  const cleanup = createCleanup(config, new UserDataRepository(pool, watchlist), log);
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
