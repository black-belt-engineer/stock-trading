import type { Redis } from "ioredis";
import { latestPriceKey, sparklineKey, type LatestPrice } from "@stock-platform/types";

export class LatestPriceRepository {
  constructor(private readonly redis: Redis) {}

  async findBySymbol(symbol: string): Promise<LatestPrice | null> {
    const raw = await this.redis.get(latestPriceKey(symbol));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as LatestPrice;
  }

  async findSparkline(symbol: string): Promise<number[]> {
    const values = await this.redis.zrange(sparklineKey(symbol), 0, -1);
    return values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
  }
}
