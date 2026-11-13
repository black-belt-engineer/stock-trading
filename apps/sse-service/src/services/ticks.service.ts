import { Readable } from "node:stream";
import { ValidationError } from "@stock-platform/errors";
import { decodeCursor, encodeCursor, resolveTimeRange, type TimeRange } from "../models/tick-query.js";
import type { TickRow, TicksPage } from "../models/ticks.js";
import type { TickRepository } from "../repositories/tick.repository.js";

/**
 * Most rows one CSV export may hold. A whole day of one symbol at the
 * simulator's one tick a second is 86,400.
 */
export const MAX_EXPORT_ROWS = 100_000;

const CSV_HEADER = "time,symbol,price,size,side\n";

export type TicksQuery = { from?: string; to?: string };

export type CsvExport = { filename: string; body: Readable };

/** `2026-11-12T10:30:00.000Z` → `20261112T103000Z` (ISO-8601 basic format, safe in a file name). */
function compactUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Every field is a number, an ISO time, a registered symbol or `buy`/`sell`,
 * so no cell can start with `=`, `+`, `-` or `@` and be read as a formula
 * (prices are positive). Free text added later must be escaped.
 */
function csvLine(symbol: string, tick: TickRow): string {
  return `${tick.time},${symbol},${tick.price ?? ""},${tick.size ?? ""},${tick.side ?? ""}\n`;
}

async function* csvChunks(symbol: string, batches: AsyncGenerator<TickRow[]>): AsyncGenerator<string> {
  yield CSV_HEADER;
  // `for await` calls `batches.return()` when this generator is ended early,
  // which closes the database cursor.
  for await (const batch of batches) {
    yield batch.map((tick) => csvLine(symbol, tick)).join("");
  }
}

export class TicksService {
  constructor(private readonly tickRepository: TickRepository) {}

  /** `symbol` must already be a registered symbol (see `resolveSymbol`). */
  async getPage(
    symbol: string,
    query: TicksQuery & { limit: number; cursor?: string },
    now = Date.now(),
  ): Promise<TicksPage> {
    const range = resolveTimeRange(query.from, query.to, now);
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    // One extra row tells whether another page exists without a count.
    const rows = await this.tickRepository.findPage(symbol, range, query.limit + 1, after);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      symbol,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      ticks: page.map(({ id, time, price, size, side }) => ({ id, time, price, size, side })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.cursor) : null,
    };
  }

  /**
   * Checks the range and the row count, then returns a stream of the CSV file
   * that reads the rows from the database as the client downloads them.
   */
  async exportCsv(symbol: string, query: TicksQuery, now = Date.now()): Promise<CsvExport> {
    const range: TimeRange = resolveTimeRange(query.from, query.to, now);
    const count = await this.tickRepository.countInRange(symbol, range);
    if (count > MAX_EXPORT_ROWS) {
      throw new ValidationError(
        `The range holds ${count} ticks; an export may hold at most ${MAX_EXPORT_ROWS}. Choose a shorter range.`,
      );
    }
    // The limit guards against rows the consumer inserted after the count.
    const batches = this.tickRepository.streamRange(symbol, range, MAX_EXPORT_ROWS);
    return {
      filename: `${symbol}_${compactUtc(range.from)}_${compactUtc(range.to)}.csv`,
      // A small buffer: at most a couple of batches are read ahead of the client.
      body: Readable.from(csvChunks(symbol, batches), { highWaterMark: 2 }),
    };
  }
}
