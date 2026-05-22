import type { Redis } from "ioredis";
import {
  latestPriceKey,
  PRICE_UPDATES_STREAM_KEY,
  PRICE_UPDATES_STREAM_MAXLEN,
  sparklineKey,
  streamQuoteFromLatest,
  type LatestPrice,
  type PriceEvent,
} from "@stock-platform/types";

function processedMarkerKey(idempotencyKey: string): string {
  return `consumer:processed:${idempotencyKey}`;
}

export class PriceRedisRepository {
  constructor(private readonly redis: Redis) {}

  async publishFromEvent(event: PriceEvent, idempotencyKey: string): Promise<void> {
    const markerKey = processedMarkerKey(idempotencyKey);
    const alreadyApplied = await this.redis.exists(markerKey);
    if (alreadyApplied) {
      return;
    }

    const latest = await this.buildLatestPrice(event);
    const quotePayload = JSON.stringify(streamQuoteFromLatest(latest));

    const result = await this.redis
      .multi()
      .set(latestPriceKey(event.symbol), JSON.stringify(latest))
      .zadd(sparklineKey(event.symbol), event.timestamp, String(event.price))
      .zremrangebyrank(sparklineKey(event.symbol), 0, -31)
      .xadd(
        PRICE_UPDATES_STREAM_KEY,
        "MAXLEN",
        "~",
        String(PRICE_UPDATES_STREAM_MAXLEN),
        "*",
        "symbol",
        event.symbol,
        "payload",
        quotePayload,
      )
      .set(markerKey, "1")
      .exec();

    if (result === null) {
      throw new Error(`Redis transaction failed for ${idempotencyKey}`);
    }

    const execError = result.find((entry) => entry[0] instanceof Error);
    if (execError) {
      throw execError[0];
    }
  }

  private async buildLatestPrice(event: PriceEvent): Promise<LatestPrice> {
    const existingRaw = await this.redis.get(latestPriceKey(event.symbol));
    const previous: LatestPrice | null = existingRaw
      ? (JSON.parse(existingRaw) as LatestPrice)
      : null;

    const currentPrice = event.price;
    const previousPrice = previous?.currentPrice ?? event.previousPrice;
    const changeValue = currentPrice - previousPrice;
    const changePercent = previousPrice === 0 ? 0 : (changeValue / previousPrice) * 100;

    return {
      symbol: event.symbol,
      name: event.name,
      currentPrice,
      previousPrice,
      changeValue,
      changePercent,
      high24h: previous ? Math.max(previous.high24h, currentPrice) : currentPrice,
      low24h: previous ? Math.min(previous.low24h, currentPrice) : currentPrice,
      volume24h: (previous?.volume24h ?? 0) + event.size,
      lastUpdated: event.timestamp,
    };
  }
}
