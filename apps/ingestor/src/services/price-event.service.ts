import type { PriceEvent } from "@stock-platform/types";
import { SYMBOL_CONFIG, RANDOM_WALK, type SymbolConfigRow } from "../constants.js";

export function randomWalkMultiplier(): number {
  return 1 + (Math.random() * 2 * RANDOM_WALK - RANDOM_WALK);
}

export function calculateNextPrice(previousPrice: number): number {
  const rawNext = previousPrice * randomWalkMultiplier();
  return Math.round(rawNext * 100) / 100;
}

export class PriceEventService {
  private readonly previousPrices = new Map<string, number>();

  constructor() {
    for (const row of SYMBOL_CONFIG) {
      this.previousPrices.set(row.symbol, row.seed);
    }
  }

  buildNextEvent(row: SymbolConfigRow): PriceEvent {
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
      exchange: "NASDAQ",
      conditions: [],
    };
  }
}
