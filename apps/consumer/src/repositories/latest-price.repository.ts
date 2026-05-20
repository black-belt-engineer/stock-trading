import type { Redis } from "ioredis";
import type { LatestPrice, PriceEvent } from "@stock-platform/types";

export class LatestPriceRepository {
  constructor(private readonly redis: Redis) {}

  async upsertFromEvent(event: PriceEvent): Promise<void> {
    const key = `price:latest:${event.symbol}`;
    const existingRaw = await this.redis.get(key);
    const previous: LatestPrice | null = existingRaw
      ? (JSON.parse(existingRaw) as LatestPrice)
      : null;

    const currentPrice = event.price;
    const previousPrice = previous?.currentPrice ?? event.previousPrice;
    const changeValue = currentPrice - previousPrice;
    const changePercent = previousPrice === 0 ? 0 : (changeValue / previousPrice) * 100;

    const latest: LatestPrice = {
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

    const sparklineKey = `price:sparkline:${event.symbol}`;
    const score = event.timestamp;
    await this.redis
      .multi()
      .set(key, JSON.stringify(latest))
      .zadd(sparklineKey, score, String(currentPrice))
      .zremrangebyrank(sparklineKey, 0, -31)
      .exec();
  }
}
