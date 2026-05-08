import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { LatestPrice, PriceEvent } from "@stock-platform/types";
import { log } from "./utils.js";

export function sideToSmallInt(side: PriceEvent["side"]): number {
  return side === "buy" ? 1 : -1;
}

export async function upsertRedisLatest(
  redis: Redis,
  event: PriceEvent,
): Promise<void> {
  const key = `price:latest:${event.symbol}`;
  const existingRaw = await redis.get(key);
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
  await redis
    .multi()
    .set(key, JSON.stringify(latest))
    .zadd(sparklineKey, score, String(currentPrice))
    .zremrangebyrank(sparklineKey, 0, -31)
    .exec();
}

export async function prepareDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_ticks (
      time TIMESTAMPTZ NOT NULL,
      symbol TEXT NOT NULL,
      price DOUBLE PRECISION,
      size NUMERIC,
      side SMALLINT
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS stock_ticks_symbol_time_idx
      ON stock_ticks (symbol, time DESC);
  `);

  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb;");
  } catch (err) {
    log.warn({ err }, "TimescaleDB extension unavailable, using regular table");
    return;
  }

  try {
    await pool.query(`
      SELECT create_hypertable('stock_ticks', 'time', if_not_exists => TRUE, migrate_data => TRUE);
    `);
    log.info("stock_ticks configured as Timescale hypertable");
  } catch (err) {
    log.warn({ err }, "Could not configure hypertable, using regular table");
  }
}
