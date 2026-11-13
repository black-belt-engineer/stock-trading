import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Parses JSON from outside the process (Kafka, Redis, another service) and
 * checks it against `schema`. Returns null for invalid JSON or a payload of
 * the wrong shape, so nothing unchecked is ever typed as `Static<T>`.
 */
export function parseJson<T extends TSchema>(schema: T, text: string): Static<T> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return Value.Check(schema, value) ? value : null;
}

/**
 * Core message flowing through the pipeline (ingest → Kafka → consumer → Redis / DB).
 */
export const PriceEventSchema = Type.Object({
  symbol: Type.String(),
  name: Type.String(),
  price: Type.Number(),
  previousPrice: Type.Number(),
  changePercent: Type.Number(),
  volume: Type.Number(),
  timestamp: Type.Number(),
  source: Type.Union([
    Type.Literal("fake"),
    Type.Literal("polygon"),
    Type.Literal("yahoo"),
    Type.Literal("exchange"),
  ]),
  size: Type.Number(),
  side: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
  exchange: Type.String(),
  conditions: Type.Array(Type.String()),
});
export type PriceEvent = Static<typeof PriceEventSchema>;

/** Kafka record key for a price tick — used as the idempotency key end-to-end. */
export function priceEventMessageKey(event: PriceEvent): string {
  return `${event.symbol}:${event.timestamp}`;
}

/**
 * Redis stream consumed by the SSE service for live price push. Each entry has
 * a `symbol` field and a `payload` field holding the {@link LatestPrice} record
 * as it was after the tick; readers map it with {@link streamQuoteFromLatest}.
 */
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

/** How the last tick moved the price against the tick before it. Drives the card's flash only. */
export const TickDirectionSchema = Type.Union([Type.Literal("up"), Type.Literal("down"), Type.Literal("flat")]);
export type TickDirection = Static<typeof TickDirectionSchema>;

const TradeSideSchema = Type.Union([Type.Literal("buy"), Type.Literal("sell")]);

/**
 * Denormalized latest quote stored in Redis per symbol, with the values of the
 * current session (see `sessionIdFor` in `@stock-platform/symbols`).
 *
 * `change` and `changePercent` are against `previousClose`, the last price of
 * the session before. Written only by the consumer's apply-tick Lua script,
 * which must produce exactly these fields.
 */
export const LatestPriceSchema = Type.Object({
  symbol: Type.String(),
  name: Type.String(),
  sessionId: Type.String(),
  currentPrice: Type.Number(),
  previousClose: Type.Number(),
  open: Type.Number(),
  high: Type.Number(),
  low: Type.Number(),
  volume: Type.Number(),
  change: Type.Number(),
  changePercent: Type.Number(),
  tickDirection: TickDirectionSchema,
  /** Size and side of the last trade applied, for the live feed. */
  lastSize: Type.Number(),
  lastSide: TradeSideSchema,
  lastUpdated: Type.Number(),
});
export type LatestPrice = Static<typeof LatestPriceSchema>;

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
 * Payload streamed to browsers via SSE: the day values of the symbol's
 * current session plus the trade that produced them. A payload with a new
 * `sessionId` replaces the client's day values; the client never computes its own.
 */
export const StreamQuoteSchema = Type.Object({
  symbol: Type.String(),
  name: Type.String(),
  sessionId: Type.String(),
  price: Type.Number(),
  previousClose: Type.Number(),
  open: Type.Number(),
  high: Type.Number(),
  low: Type.Number(),
  volume: Type.Number(),
  change: Type.Number(),
  changePercent: Type.Number(),
  tickDirection: TickDirectionSchema,
  /** Size of the trade, in shares. */
  quantity: Type.Number(),
  side: TradeSideSchema,
  timestamp: Type.Number(),
});
export type StreamQuote = Static<typeof StreamQuoteSchema>;

export function streamQuoteFromLatest(latest: LatestPrice): StreamQuote {
  return {
    symbol: latest.symbol,
    name: latest.name,
    sessionId: latest.sessionId,
    price: latest.currentPrice,
    previousClose: latest.previousClose,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    change: latest.change,
    changePercent: latest.changePercent,
    tickDirection: latest.tickDirection,
    quantity: latest.lastSize,
    side: latest.lastSide,
    timestamp: latest.lastUpdated,
  };
}
