import { AppError } from "@stock-platform/errors";
import type { Pool } from "pg";
import type { CandleWindow } from "../models/candles.js";

/** One aggregated bucket, before empty buckets are filled. */
export type CandleRow = {
  /** Bucket start, epoch ms. */
  start: number;
  /** Time of the bucket's newest trade, epoch ms. */
  lastTrade: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** `pg` returns DOUBLE PRECISION as a number and NUMERIC (the `size` sum) as a string. */
function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCandleRow(row: unknown): CandleRow | null {
  if (typeof row !== "object" || row === null) return null;
  const start = finiteNumber(Reflect.get(row, "bucket_ms"));
  const lastTrade = finiteNumber(Reflect.get(row, "last_trade_ms"));
  const open = finiteNumber(Reflect.get(row, "open"));
  const high = finiteNumber(Reflect.get(row, "high"));
  const low = finiteNumber(Reflect.get(row, "low"));
  const close = finiteNumber(Reflect.get(row, "close"));
  if (start === null || lastTrade === null || open === null || high === null || low === null || close === null) return null;
  // Rows older than the current schema can lack a size; they add nothing to the volume.
  const volume = finiteNumber(Reflect.get(row, "volume")) ?? 0;
  return { start, lastTrade, open, high, low, close, volume };
}

/** Postgres `undefined_function` and `undefined_table`: no TimescaleDB, or no `candles_1m` aggregate yet. */
const MISSING_AGGREGATE_CODES = new Set(["42883", "42P01"]);

function isMissingAggregate(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code: unknown = Reflect.get(err, "code");
  return typeof code === "string" && MISSING_AGGREGATE_CODES.has(code);
}

function missingAggregateError(): AppError {
  return new AppError(
    "Candles need the TimescaleDB aggregate candles_1m, which this database does not have (the consumer creates it at start)",
    501,
    "NOT_IMPLEMENTED",
  );
}

/**
 * Reads candles from `candles_1m`, the 1-minute continuous aggregate of
 * `stock_ticks` that the consumer creates (ADR-003). Raw ticks are dropped
 * after 30 days; the aggregate is kept, so candles never read the raw table.
 * Real-time aggregation is on, so the open minute is included. Read-only.
 */
export class CandleRepository {
  constructor(private readonly db: Pool) {}

  /**
   * One row per bucket of `window` that holds at least one priced tick, oldest
   * first, rolled up from the 1-minute rows: open and close are the first and
   * last minute's, high and low the extremes, volume the sum. Fixed widths use
   * `time_bucket` aligned to the Unix epoch; a calendar interval (`1d`) groups
   * by the explicit session starts in `window.starts` with `width_bucket`, so
   * its edges come from the market calendar, not from SQL. Every edge must fall
   * on a whole minute, which session starts at UTC midnight do. Throws 501 when
   * the aggregate does not exist.
   */
  async aggregate(symbol: string, window: CandleWindow): Promise<CandleRow[]> {
    const values: unknown[] = [symbol, new Date(window.from).toISOString(), new Date(window.to).toISOString()];
    let bucket: string;
    if (window.bucketing.kind === "fixed") {
      values.push(`${window.bucketing.widthMs} milliseconds`);
      bucket = "time_bucket($4::interval, bucket, TIMESTAMPTZ 'epoch')";
    } else {
      values.push(window.starts.map((start) => new Date(start).toISOString()));
      // width_bucket gives i with starts[i] <= bucket < starts[i + 1]; the WHERE
      // clause keeps every row inside the window, so i is always in range.
      bucket = "($4::timestamptz[])[width_bucket(bucket, $4::timestamptz[])]";
    }
    try {
      const result = await this.db.query(
        `
        SELECT
          extract(epoch FROM ${bucket})::float8 * 1000 AS bucket_ms,
          first(open, bucket) AS open,
          max(high) AS high,
          min(low) AS low,
          last(close, bucket) AS close,
          sum(volume) AS volume,
          extract(epoch FROM max(last_trade))::float8 * 1000 AS last_trade_ms
        FROM candles_1m
        WHERE symbol = $1 AND bucket >= $2::timestamptz AND bucket < $3::timestamptz
        GROUP BY 1
        ORDER BY 1
      `,
        values,
      );
      return result.rows.map(toCandleRow).filter((row): row is CandleRow => row !== null);
    } catch (err) {
      if (isMissingAggregate(err)) throw missingAggregateError();
      throw err;
    }
  }

  /**
   * The last close of `symbol` in a minute that starts before `before` (epoch
   * ms, a bucket edge, so a whole minute), or null when there is none.
   */
  async lastPriceBefore(symbol: string, before: number): Promise<number | null> {
    try {
      const result = await this.db.query(
        `
        SELECT close FROM candles_1m
        WHERE symbol = $1 AND bucket < $2::timestamptz
        ORDER BY bucket DESC
        LIMIT 1
      `,
        [symbol, new Date(before).toISOString()],
      );
      const row: unknown = result.rows[0];
      return typeof row === "object" && row !== null ? finiteNumber(Reflect.get(row, "close")) : null;
    } catch (err) {
      if (isMissingAggregate(err)) throw missingAggregateError();
      throw err;
    }
  }
}
