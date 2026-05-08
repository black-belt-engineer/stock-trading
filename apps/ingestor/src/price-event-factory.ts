import type { PriceEvent } from "@stock-platform/types";
import type { SymbolConfigRow } from "./constants.js";
import { RANDOM_WALK } from "./constants.js";

export function randomWalkMultiplier(): number {
  return 1 + (Math.random() * 2 * RANDOM_WALK - RANDOM_WALK);
}

export function calculateNextPrice(previousPrice: number): number {
  const rawNext = previousPrice * randomWalkMultiplier();
  return Math.round(rawNext * 100) / 100;
}

export function buildPriceEvent(
  row: SymbolConfigRow,
  previousPrice: number,
  nextPrice: number,
): PriceEvent {
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
