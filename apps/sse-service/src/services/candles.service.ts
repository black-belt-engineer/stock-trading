import type { OhlcvBar } from "@stock-platform/types";
import { resolveCandleWindow, type CandlesQuery, type CandlesResponse } from "../models/candles.js";
import type { CandleRepository, CandleRow } from "../repositories/candle.repository.js";

export class CandlesService {
  constructor(private readonly candleRepository: CandleRepository) {}

  /**
   * OHLCV bars of `symbol` (already resolved against the registry) for the
   * requested window, oldest first. With `fill: "previous"` a bucket without
   * trades becomes a flat bar at the last close before it, volume 0; buckets
   * before the symbol's first trade stay empty either way. A bar whose bucket
   * has not ended yet is `complete: false`.
   */
  async getCandles(symbol: string, exchange: string, query: CandlesQuery, now = Date.now()): Promise<CandlesResponse> {
    const window = resolveCandleWindow(query.interval, exchange, query.from, query.to, now);
    const rows = await this.candleRepository.aggregate(symbol, window);
    const byStart = new Map<number, CandleRow>(rows.map((row) => [row.start, row]));

    let previousClose =
      query.fill === "previous" ? await this.candleRepository.lastPriceBefore(symbol, window.from) : null;
    const bars: OhlcvBar[] = [];
    window.starts.forEach((start, i) => {
      const end = window.ends[i] ?? start;
      const base = { symbol, timestamp: start, end, interval: query.interval, complete: end <= now };
      const row = byStart.get(start);
      if (row) {
        bars.push({ ...base, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume });
        previousClose = row.close;
      } else if (query.fill === "previous" && previousClose !== null) {
        const p = previousClose;
        bars.push({ ...base, open: p, high: p, low: p, close: p, volume: 0 });
      }
    });

    return {
      symbol,
      interval: query.interval,
      fill: query.fill,
      from: new Date(window.from).toISOString(),
      to: new Date(window.to).toISOString(),
      bars,
    };
  }
}
