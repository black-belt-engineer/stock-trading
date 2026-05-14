import type { LatestPrice, StreamQuote } from "@stock-platform/types";
import { DEFAULT_SYMBOLS } from "./constants.js";

export function parseSymbols(rawSymbols?: string): string[] {
  if (!rawSymbols) {
    return [...DEFAULT_SYMBOLS];
  }
  const parsed = rawSymbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_SYMBOLS];
}

export function toStreamQuote(latest: LatestPrice): StreamQuote {
  return {
    symbol: latest.symbol,
    name: latest.name,
    price: latest.currentPrice,
    changePercent: latest.changePercent,
    quantity: 0,
    side: latest.changeValue >= 0 ? "buy" : "sell",
    timestamp: latest.lastUpdated,
  };
}
