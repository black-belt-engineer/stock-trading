import type { Pool, PoolClient } from "pg";
import type { PriceEvent } from "@stock-platform/types";
import type { Logger } from "@stock-platform/logger";

function sideToSmallInt(side: PriceEvent["side"]): number {
  return side === "buy" ? 1 : -1;
}

export class StockTickRepository {
  constructor(
    private readonly db: Pool,
    private readonly log: Logger,
  ) {}

  async prepareSchema(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS stock_ticks (
        time TIMESTAMPTZ NOT NULL,
        symbol TEXT NOT NULL,
        price DOUBLE PRECISION,
        size NUMERIC,
        side SMALLINT,
        idempotency_key TEXT NOT NULL
      );
    `);

    await this.db.query(`
      ALTER TABLE stock_ticks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    `);

    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS stock_ticks_idempotency_key_uidx
        ON stock_ticks (idempotency_key, time);
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS stock_ticks_symbol_time_idx
        ON stock_ticks (symbol, time DESC);
    `);

    try {
      await this.db.query("CREATE EXTENSION IF NOT EXISTS timescaledb;");
    } catch (err) {
      this.log.warn({ err }, "TimescaleDB extension unavailable, using regular table");
      return;
    }

    try {
      await this.db.query(`
        SELECT create_hypertable('stock_ticks', 'time', if_not_exists => TRUE, migrate_data => TRUE);
      `);
      this.log.info("stock_ticks configured as Timescale hypertable");
    } catch (err) {
      this.log.warn({ err }, "Could not configure hypertable, using regular table");
    }
  }

  /**
   * Inserts one tick keyed by the Kafka message key.
   * Duplicate deliveries are a no-op via ON CONFLICT.
   */
  async insertTick(
    client: PoolClient,
    event: PriceEvent,
    idempotencyKey: string,
  ): Promise<void> {
    await client.query(
      `
      INSERT INTO stock_ticks (time, symbol, price, size, side, idempotency_key)
      VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6)
      ON CONFLICT (idempotency_key, time) DO NOTHING
    `,
      [
        event.timestamp,
        event.symbol,
        event.price,
        event.size,
        sideToSmallInt(event.side),
        idempotencyKey,
      ],
    );
  }
}
