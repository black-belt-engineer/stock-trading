import { fileURLToPath } from "node:url";
import { runMigrations } from "@stock-platform/db";
import type { Pool } from "pg";

/** `apps/portfolio/migrations`, from `src/` under tsx and from `dist/` once built. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/** This service's history; the database is shared with the SSE service and the consumer. */
const MIGRATIONS_TABLE = "portfolio_schema_migrations";

/** Brings the portfolio tables up to date. Runs at start-up and before the cleanup script. */
export async function migrate(pool: Pool, log: { info: (message: string) => void }): Promise<string[]> {
  return runMigrations(pool, { dir: MIGRATIONS_DIR, table: MIGRATIONS_TABLE, log });
}
