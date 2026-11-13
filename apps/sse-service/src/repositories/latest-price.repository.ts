import type { Redis } from "ioredis";
import {
  LatestPriceSchema,
  latestPriceKey,
  parseJson,
  sparklineKey,
  sparklinePriceFromMember,
  type LatestPrice,
} from "@stock-platform/types";

export class LatestPriceRepository {
  constructor(private readonly redis: Redis) {}

  async findBySymbol(symbol: string): Promise<LatestPrice | null> {
    const raw = await this.redis.get(latestPriceKey(symbol));
    if (!raw) {
      return null;
    }
    // A record of the wrong shape counts as no quote rather than a broken one.
    return parseJson(LatestPriceSchema, raw);
  }

  async findSparkline(symbol: string): Promise<number[]> {
    const values = await this.redis.zrange(sparklineKey(symbol), 0, -1);
    return values
      .map((member) => sparklinePriceFromMember(member))
      .filter((price): price is number => price !== null);
  }
}
