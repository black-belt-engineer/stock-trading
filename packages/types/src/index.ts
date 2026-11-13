/**
 * Core message flowing through the pipeline (ingest → Kafka → consumer → Redis / DB).
 */
export type PriceEvent = {
  symbol: string;
  name: string;
  price: number;
  previousPrice: number;
  changePercent: number;
  volume: number;
  timestamp: number;
  source: "fake" | "polygon" | "yahoo" | "exchange";
  size: number;
  side: "buy" | "sell";
  exchange: string;
  conditions: string[];
};

/** Kafka record key for a price tick — used as the idempotency key end-to-end. */
export function priceEventMessageKey(event: PriceEvent): string {
  return `${event.symbol}:${event.timestamp}`;
}

/** Redis stream consumed by the SSE service for live price push. */
export const PRICE_UPDATES_STREAM_KEY = "price:updates";

/** Approximate max length for {@link PRICE_UPDATES_STREAM_KEY} (trim old entries). */
export const PRICE_UPDATES_STREAM_MAXLEN = 10_000;

export function latestPriceKey(symbol: string): string {
  return `price:latest:${symbol}`;
}

export function sparklineKey(symbol: string): string {
  return `price:sparkline:${symbol}`;
}

/**
 * Sorted-set member for one sparkline point. The timestamp prefix keeps the
 * member unique per tick, so a repeated price adds a point instead of moving
 * the existing one.
 */
export function sparklineMember(timestamp: number, price: number): string {
  return `${timestamp}:${price}`;
}

/**
 * Reads the price out of a sparkline member. Accepts the current
 * `"<timestamp>:<price>"` format and the legacy bare `"<price>"` format that
 * may still be in Redis. Returns `null` for anything unparseable.
 */
export function sparklinePriceFromMember(member: string): number | null {
  const separator = member.indexOf(":");
  const raw = separator === -1 ? member : member.slice(separator + 1);
  if (raw.trim() === "") {
    return null;
  }
  const price = Number(raw);
  return Number.isFinite(price) ? price : null;
}

/**
 * Denormalized latest quote stored in Redis per symbol.
 */
export type LatestPrice = {
  symbol: string;
  name: string;
  currentPrice: number;
  previousPrice: number;
  changeValue: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
};

/**
 * OHLCV candle for charting (Phase 3).
 */
export type OhlcvBar = {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: "1m" | "5m" | "1h" | "1d";
};

/**
 * Payload streamed to browsers via SSE.
 */
export type StreamQuote = {
  symbol: string;
  name: string;
  price: number;
  changeValue: number;
  changePercent: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
};

export function streamQuoteFromLatest(latest: LatestPrice): StreamQuote {
  return {
    symbol: latest.symbol,
    name: latest.name,
    price: latest.currentPrice,
    changeValue: latest.changeValue,
    changePercent: latest.changePercent,
    quantity: 0,
    side: latest.changeValue >= 0 ? "buy" : "sell",
    timestamp: latest.lastUpdated,
  };
}
