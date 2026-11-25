import { latestPriceKey, LatestPriceSchema, parseJson } from "@stock-platform/types";
import type { Redis } from "ioredis";
import { centsFromQuote } from "../models/money.js";

export type Quote = {
  /** Whole cents. */
  priceCents: bigint;
  /** When the price was traded (the tick's time), epoch ms. */
  at: number;
};

/** ioredis queues commands while it reconnects; an order holding the account lock must not wait for that. */
const REDIS_TIMEOUT_MS = 1_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function quoteOf(raw: string | null): Quote | null {
  if (raw === null) return null;
  const record = parseJson(LatestPriceSchema, raw);
  if (!record) return null;
  const priceCents = centsFromQuote(record.currentPrice);
  return priceCents === null ? null : { priceCents, at: record.lastUpdated };
}

/**
 * The latest prices the consumer keeps in Redis (`price:latest:<symbol>`). The server always
 * fills orders at this price; the client never supplies one. Throws when Redis fails or is slow.
 */
export class PriceReader {
  constructor(
    private readonly redis: Redis,
    private readonly timeoutMs = REDIS_TIMEOUT_MS,
  ) {}

  /** `null` when there is no usable record for the symbol. */
  async latest(symbol: string): Promise<Quote | null> {
    return quoteOf(await withTimeout(this.redis.get(latestPriceKey(symbol)), this.timeoutMs));
  }

  /** Every symbol that has a usable record. */
  async latestMany(symbols: readonly string[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();
    if (symbols.length === 0) return quotes;
    const raw = await withTimeout(this.redis.mget(...symbols.map(latestPriceKey)), this.timeoutMs);
    symbols.forEach((symbol, index) => {
      const quote = quoteOf(raw[index] ?? null);
      if (quote) quotes.set(symbol, quote);
    });
    return quotes;
  }
}
