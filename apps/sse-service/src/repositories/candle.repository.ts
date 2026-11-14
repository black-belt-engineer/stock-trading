import { AppError } from "@stock-platform/errors";
import type { Pool } from "pg";
import type { CandleWindow } from "../models/candles.js";

/** One aggregated bucket, before empty buckets are filled. */
export type CandleRow = {
  /** Bucket start, epoch ms. */
  start: number;
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
  const open = finiteNumber(Reflect.get(row, "open"));
  const high = finiteNumber(Reflect.get(row, "high"));
  const low = finiteNumber(Reflect.get(row, "low"));
  const close = finiteNumber(Reflect.get(row, "close"));
  if (start === null || open === null || high === null || low === null || close === null) return null;
  // Rows older than the current schema can lack a size; they add nothing to the volume.
  const volume = finiteNumber(Reflect.get(row, "volume")) ?? 0;
  return { start, open, high, low, close, volume };
}

/** Postgres `undefined_function`: `time_bucket`, `first` or `last` without the TimescaleDB extension. */
const UNDEFINED_FUNCTION = "42883";

function isUndefinedFunction(err: unknown): boolean {
  return typeof err === "object" && err !== null && Reflect.get(err, "code") === UNDEFINED_FUNCTION;
}

/** Aggregates `stock_ticks`, which the consumer writes, into OHLCV buckets. Read-only. */
export class CandleRepository {
  constructor(private readonly db: Pool) {}

  /**
   * One row per bucket of `window` that holds at least one priced tick, oldest
   * first. Open and close are the first and last price by time (TimescaleDB's
   * `first` and `last`). Fixed widths use `time_bucket` aligned to the Unix
   * epoch; a calendar interval (`1d`) groups by the explicit session starts in
   * `window.starts` with `width_bucket`, so its edges come from the market
   * calendar, not from SQL. Throws 501 when TimescaleDB is not installed.
   */
  async aggregate(symbol: string, window: CandleWindow): Promise<CandleRow[]> {
    const values: unknown[] = [symbol, new Date(window.from).toISOString(), new Date(window.to).toISOString()];
    let bucket: string;
    if (window.bucketing.kind === "fixed") {
      values.push(`${window.bucketing.widthMs} milliseconds`);
      bucket = "time_bucket($4::interval, time, TIMESTAMPTZ 'epoch')";
    } else {
      values.push(window.starts.map((start) => new Date(start).toISOString()));
      // width_bucket gives i with starts[i] <= time < starts[i + 1]; the WHERE
      // clause keeps every row inside the window, so i is always in range.
      bucket = "($4::timestamptz[])[width_bucket(time, $4::timestamptz[])]";
    }
    try {
      const result = await this.db.query(
        `
        SELECT
          extract(epoch FROM ${bucket})::float8 * 1000 AS bucket_ms,
          first(price, time) AS open,
          max(price) AS high,
          min(price) AS low,
          last(price, time) AS close,
          sum(size) AS volume
        FROM stock_ticks
        WHERE symbol = $1 AND time >= $2::timestamptz AND time < $3::timestamptz AND price IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `,
        values,
      );
      return result.rows.map(toCandleRow).filter((row): row is CandleRow => row !== null);
    } catch (err) {
      if (isUndefinedFunction(err)) {
        throw new AppError(
          "Candles need the TimescaleDB extension, which this database does not have",
          501,
          "NOT_IMPLEMENTED",
        );
      }
      throw err;
    }
  }

  /** The last price of `symbol` strictly before `before` (epoch ms), or null when there is none. */
  async lastPriceBefore(symbol: string, before: number): Promise<number | null> {
    const result = await this.db.query(
      `
      SELECT price FROM stock_ticks
      WHERE symbol = $1 AND time < $2::timestamptz AND price IS NOT NULL
      ORDER BY time DESC
      LIMIT 1
    `,
      [symbol, new Date(before).toISOString()],
    );
    const row: unknown = result.rows[0];
    return typeof row === "object" && row !== null ? finiteNumber(Reflect.get(row, "price")) : null;
  }
}
