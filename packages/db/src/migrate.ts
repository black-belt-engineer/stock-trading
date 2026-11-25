import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";

/** One migration file: `0001_initial.sql`. Run in name order, each in its own transaction. */
export type Migration = {
  name: string;
  sql: string;
  /** sha256 of the file, hex. A file changed after it ran is refused. */
  checksum: string;
};

/** A row of the service's migrations table. */
export type AppliedMigration = {
  name: string;
  checksum: string;
};

export type MigrationLog = {
  info: (message: string) => void;
};

export type RunMigrationsOptions = {
  /** The folder with the `.sql` files. */
  dir: string;
  /**
   * The table recording what ran, one per service: the services share one database, so a
   * shared table would mix their histories. Lower-case letters, digits and `_`.
   */
  table: string;
  log?: MigrationLog;
};

/** Four digits, an underscore, then lower-case words: `0002_paper_trading.sql`. */
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const TABLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function checksumOf(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Reads the migrations in `dir`, sorted by name. A `.sql` file whose name does not follow the
 * pattern, or two files with the same number, is an error rather than a file silently skipped.
 */
export async function readMigrations(dir: string): Promise<Migration[]> {
  const entries = await readdir(dir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();
  const numbers = new Set<string>();
  const migrations: Migration[] = [];
  for (const name of files) {
    const match = FILE_PATTERN.exec(name);
    const number = match?.[1];
    if (number === undefined) {
      throw new MigrationError(`Migration file name ${name} does not match NNNN_name.sql`);
    }
    if (numbers.has(number)) {
      throw new MigrationError(`Two migrations are numbered ${number}`);
    }
    numbers.add(number);
    const sql = await readFile(join(dir, name), "utf8");
    migrations.push({ name, sql, checksum: checksumOf(sql) });
  }
  return migrations;
}

/**
 * The migrations still to run. Forward only, and strict, because these tables hold money:
 * - a migration the database has but the code does not (newer code ran here) is refused;
 * - a migration that ran with different contents (the file was edited) is refused;
 * - a new migration numbered before one that already ran (a merge out of order) is refused.
 * Each of those needs a person to look, not a guess.
 */
export function planMigrations(files: readonly Migration[], applied: readonly AppliedMigration[]): Migration[] {
  const byName = new Map(files.map((file) => [file.name, file]));
  for (const row of applied) {
    const file = byName.get(row.name);
    if (!file) {
      throw new MigrationError(`The database has migration ${row.name}, which this code does not have`);
    }
    if (file.checksum !== row.checksum) {
      throw new MigrationError(`Migration ${row.name} was changed after it ran; add a new migration instead`);
    }
  }
  const appliedNames = new Set(applied.map((row) => row.name));
  const pending = files.filter((file) => !appliedNames.has(file.name));
  const lastApplied = applied.map((row) => row.name).sort().at(-1);
  const early = lastApplied === undefined ? undefined : pending.find((file) => file.name < lastApplied);
  if (early && lastApplied !== undefined) {
    throw new MigrationError(`Migration ${early.name} is older than ${lastApplied}, which already ran`);
  }
  return pending;
}

function appliedOf(row: unknown): AppliedMigration | null {
  if (typeof row !== "object" || row === null) return null;
  const name: unknown = Reflect.get(row, "name");
  const checksum: unknown = Reflect.get(row, "checksum");
  return typeof name === "string" && typeof checksum === "string" ? { name, checksum } : null;
}

/**
 * Brings the database up to date: runs every pending migration in `dir`, in order, each in
 * its own transaction together with its row in `table`. A failing migration is rolled back and
 * stops the run; the ones before it stay applied. A session advisory lock makes a second
 * instance starting at the same moment wait, then find nothing left to do.
 *
 * A file cannot use statements that refuse a transaction (`CREATE INDEX CONCURRENTLY`).
 * Returns the names of the migrations it ran.
 */
export async function runMigrations(pool: Pool, options: RunMigrationsOptions): Promise<string[]> {
  const { dir, table, log } = options;
  if (!TABLE_PATTERN.test(table)) {
    throw new MigrationError(`Invalid migrations table name: ${JSON.stringify(table)}`);
  }
  const files = await readMigrations(dir);
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [`migrations:${table}`]);
    try {
      return await applyPending(client, table, files, log);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`migrations:${table}`]);
    }
  } catch (error) {
    // A connection in an unknown state is not handed back to the pool.
    broken = !(error instanceof MigrationError);
    throw error;
  } finally {
    client.release(broken);
  }
}

async function applyPending(
  client: PoolClient,
  table: string,
  files: readonly Migration[],
  log: MigrationLog | undefined,
): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const result = await client.query(`SELECT name, checksum FROM ${table} ORDER BY name`);
  const applied = result.rows.map(appliedOf).filter((row): row is AppliedMigration => row !== null);
  const pending = planMigrations(files, applied);
  for (const migration of pending) {
    await client.query("BEGIN");
    try {
      // No parameters: the simple query protocol, so a file may hold several statements.
      await client.query(migration.sql);
      await client.query(`INSERT INTO ${table} (name, checksum) VALUES ($1, $2)`, [
        migration.name,
        migration.checksum,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const reason = error instanceof Error ? error.message : String(error);
      throw new MigrationError(`Migration ${migration.name} failed and was rolled back: ${reason}`);
    }
    log?.info(`Applied migration ${migration.name}`);
  }
  return pending.map((migration) => migration.name);
}
