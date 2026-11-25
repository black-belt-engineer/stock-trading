import "./fastify-augment.js";

export { createPool, closePool, pingPool } from "./pool.js";
export { dbPlugin, type DbPluginOptions } from "./plugin.js";
export {
  checksumOf,
  MigrationError,
  planMigrations,
  readMigrations,
  runMigrations,
  type AppliedMigration,
  type Migration,
  type MigrationLog,
  type RunMigrationsOptions,
} from "./migrate.js";
