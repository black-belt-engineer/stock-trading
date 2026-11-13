import { Type } from "@sinclair/typebox";
import type { Redis } from "ioredis";
import { latestPriceKey, parseJson, type PriceEvent } from "@stock-platform/types";
import { SYMBOL_REGISTRY, type SymbolInfo } from "@stock-platform/symbols";
import { RANDOM_WALK } from "../constants.js";

export function randomWalkMultiplier(): number {
  return 1 + (Math.random() * 2 * RANDOM_WALK - RANDOM_WALK);
}

export function calculateNextPrice(previousPrice: number): number {
  const rawNext = previousPrice * randomWalkMultiplier();
  return Math.round(rawNext * 100) / 100;
}

/**
 * Only the price of the stored latest-price record is needed. Checking that
 * one field also accepts records written before the session fields existed.
 */
const StoredPriceSchema = Type.Object({ currentPrice: Type.Number({ exclusiveMinimum: 0 }) });

export class PriceEventService {
  private readonly previousPrices = new Map<string, number>();

  constructor() {
    for (const row of SYMBOL_REGISTRY) {
      this.previousPrices.set(row.symbol, row.seed);
    }
  }

  /**
   * Continues each symbol from the last price the consumer stored, so an
   * ingestor restart does not jump every price back to its seed. A symbol
   * with no readable record keeps its seed. Returns how many were resumed.
   */
  async resumeFrom(redis: Redis): Promise<number> {
    const raws = await redis.mget(SYMBOL_REGISTRY.map((row) => latestPriceKey(row.symbol)));
    let resumed = 0;
    SYMBOL_REGISTRY.forEach((row, i) => {
      const raw = raws[i];
      const stored = raw ? parseJson(StoredPriceSchema, raw) : null;
      if (stored) {
        this.previousPrices.set(row.symbol, stored.currentPrice);
        resumed += 1;
      }
    });
    return resumed;
  }

  buildNextEvent(row: SymbolInfo): PriceEvent {
    const previousPrice = this.previousPrices.get(row.symbol) ?? row.seed;
    const nextPrice = calculateNextPrice(previousPrice);
    this.previousPrices.set(row.symbol, nextPrice);

    const changePercent =
      previousPrice === 0 ? 0 : ((nextPrice - previousPrice) / previousPrice) * 100;

    const volume = Math.floor(5000 + Math.random() * 450_000);
    const size = Math.floor(1 + Math.random() * 500);
    const side: "buy" | "sell" = Math.random() < 0.5 ? "buy" : "sell";

    return {
      symbol: row.symbol,
      name: row.name,
      price: nextPrice,
      previousPrice,
      changePercent,
      volume,
      timestamp: Date.now(),
      source: "fake",
      size,
      side,
      exchange: row.exchange,
      conditions: [],
    };
  }
}
