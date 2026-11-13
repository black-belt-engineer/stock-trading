import type { Pool } from "pg";
import type { PriceEvent } from "@stock-platform/types";
import type { Logger } from "@stock-platform/logger";
import type { SessionBaseline } from "./price-redis.repository.js";

/** A numeric column value: `pg` returns DOUBLE PRECISION as a number and NUMERIC as a string. */
function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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

    // Simulated and real ticks must stay distinguishable once a real feed exists.
    // Rows written before this column existed have NULL.
    await this.db.query(`
      ALTER TABLE stock_ticks ADD COLUMN IF NOT EXISTS source TEXT;
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
  async insertTick(event: PriceEvent, idempotencyKey: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO stock_ticks (time, symbol, price, size, side, idempotency_key, source)
        VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6, $7)
        ON CONFLICT (idempotency_key, time) DO NOTHING
      `,
        [
          event.timestamp,
          event.symbol,
          event.price,
          event.size,
          sideToSmallInt(event.side),
          idempotencyKey,
          event.source,
        ],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The day values stored before `beforeTimestamp` (epoch ms), for a cold
   * start in Redis: the last price before the session started (the previous
   * close) and open, high, low and volume of the ticks of this session so far.
   * The tick being applied is already in the table, hence "before".
   */
  async findSessionBaseline(
    symbol: string,
    sessionStart: number,
    beforeTimestamp: number,
  ): Promise<SessionBaseline> {
    const result = await this.db.query(
      `
      SELECT
        (SELECT price FROM stock_ticks
          WHERE symbol = $1 AND time < to_timestamp($2 / 1000.0)
          ORDER BY time DESC LIMIT 1) AS previous_close,
        (SELECT price FROM stock_ticks
          WHERE symbol = $1 AND time >= to_timestamp($2 / 1000.0) AND time < to_timestamp($3 / 1000.0)
          ORDER BY time ASC LIMIT 1) AS open,
        MAX(price) AS high,
        MIN(price) AS low,
        SUM(size) AS volume
      FROM stock_ticks
      WHERE symbol = $1 AND time >= to_timestamp($2 / 1000.0) AND time < to_timestamp($3 / 1000.0)
    `,
      [symbol, sessionStart, beforeTimestamp],
    );
    const row: unknown = result.rows[0];
    if (typeof row !== "object" || row === null) {
      return { previousClose: null, open: null, high: null, low: null, volume: null };
    }
    return {
      previousClose: numberOrNull(Reflect.get(row, "previous_close")),
      open: numberOrNull(Reflect.get(row, "open")),
      high: numberOrNull(Reflect.get(row, "high")),
      low: numberOrNull(Reflect.get(row, "low")),
      volume: numberOrNull(Reflect.get(row, "volume")),
    };
  }
}
