import type { Redis } from "ioredis";
import type { LatestPrice } from "@stock-platform/types";

export async function readLatestPrice(
  redis: Redis,
  symbol: string,
): Promise<LatestPrice | null> {
  const raw = await redis.get(`price:latest:${symbol}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as LatestPrice;
}

export async function readSparkline(redis: Redis, symbol: string): Promise<number[]> {
  const values = await redis.zrange(`price:sparkline:${symbol}`, 0, -1);
  return values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
}
