import type { Pool } from "pg";
import Cursor from "pg-cursor";
import type { TimeRange } from "../models/tick-query.js";
import type { TickCursor, TickRow } from "../models/ticks.js";

/**
 * Columns every tick query selects. The time is read as text with all six
 * fractional digits, so a cursor compares against exactly the stored value
 * (a JavaScript Date would round it to milliseconds).
 */
const TICK_COLUMNS = `
  to_char(time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_time,
  idempotency_key, price, size, side`;

/** `pg` returns DOUBLE PRECISION as a number and NUMERIC as a string. */
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

/** The consumer stores the side as 1 (buy) or -1 (sell). */
function sideOf(value: unknown): TickRow["side"] {
  if (value === 1) return "buy";
  if (value === -1) return "sell";
  return null;
}

function toTickRow(row: unknown): TickRow | null {
  if (typeof row !== "object" || row === null) return null;
  const exactTime: unknown = Reflect.get(row, "exact_time");
  const key: unknown = Reflect.get(row, "idempotency_key");
  if (typeof exactTime !== "string" || typeof key !== "string") return null;
  const ms = Date.parse(exactTime);
  if (!Number.isFinite(ms)) return null;
  return {
    id: key,
    time: new Date(ms).toISOString(),
    price: numberOrNull(Reflect.get(row, "price")),
    size: numberOrNull(Reflect.get(row, "size")),
    side: sideOf(Reflect.get(row, "side")),
    cursor: { time: exactTime, key },
  };
}

function toTickRows(rows: unknown[]): TickRow[] {
  return rows.map(toTickRow).filter((row): row is TickRow => row !== null);
}

/** How many rows a CSV export fetches from the cursor at a time. */
const EXPORT_BATCH_ROWS = 500;

/** Reads `stock_ticks`, which the consumer writes. Read-only. */
export class TickRepository {
  constructor(private readonly db: Pool) {}

  /**
   * Up to `limit` ticks of `symbol` in the range, newest first, strictly older
   * than `after` when given (keyset pagination: `(time, idempotency_key)` is
   * unique, so rows of equal time are neither repeated nor skipped).
   * Served by `stock_ticks_symbol_time_idx (symbol, time DESC)`.
   */
  async findPage(symbol: string, range: TimeRange, limit: number, after: TickCursor | null): Promise<TickRow[]> {
    const values: unknown[] = [symbol, range.from.toISOString(), range.to.toISOString(), limit];
    let keyset = "";
    if (after) {
      values.push(after.time, after.key);
      // `time <= $5` repeats the row comparison in a form the index range scan can use.
      keyset = "AND time <= $5::timestamptz AND (time, idempotency_key) < ($5::timestamptz, $6::text)";
    }
    const result = await this.db.query(
      `
      SELECT ${TICK_COLUMNS}
      FROM stock_ticks
      WHERE symbol = $1 AND time >= $2::timestamptz AND time < $3::timestamptz
        ${keyset}
      ORDER BY time DESC, idempotency_key DESC
      LIMIT $4
    `,
      values,
    );
    return toTickRows(result.rows);
  }

  /** Number of ticks of `symbol` in the range. */
  async countInRange(symbol: string, range: TimeRange): Promise<number> {
    const result = await this.db.query(
      `
      SELECT count(*) AS n FROM stock_ticks
      WHERE symbol = $1 AND time >= $2::timestamptz AND time < $3::timestamptz
    `,
      [symbol, range.from.toISOString(), range.to.toISOString()],
    );
    const row: unknown = result.rows[0];
    const n = typeof row === "object" && row !== null ? numberOrNull(Reflect.get(row, "n")) : null;
    return n ?? 0;
  }

  /**
   * Every tick of `symbol` in the range, oldest first, at most `maxRows`,
   * in batches read from a server-side cursor, so the whole result is never
   * in memory. Holds one pooled connection until the iteration ends. Ending
   * it early (`return()`, which a destroyed `Readable.from` stream calls)
   * closes the cursor and releases the connection.
   */
  async *streamRange(symbol: string, range: TimeRange, maxRows: number): AsyncGenerator<TickRow[]> {
    const client = await this.db.connect();
    let failed: Error | undefined;
    const cursor = client.query(
      new Cursor<unknown>(
        `
        SELECT ${TICK_COLUMNS}
        FROM stock_ticks
        WHERE symbol = $1 AND time >= $2::timestamptz AND time < $3::timestamptz
        ORDER BY time ASC, idempotency_key ASC
        LIMIT $4
      `,
        [symbol, range.from.toISOString(), range.to.toISOString(), maxRows],
      ),
    );
    try {
      for (;;) {
        const rows = await cursor.read(EXPORT_BATCH_ROWS);
        if (rows.length === 0) return;
        yield toTickRows(rows);
      }
    } catch (err) {
      failed = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      if (failed) {
        // The connection is in an unknown state; release(err) discards it instead of pooling it.
        client.release(failed);
      } else {
        try {
          await cursor.close();
          client.release();
        } catch (err) {
          client.release(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }
}
