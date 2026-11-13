import type { Redis, Result } from "ioredis";
import {
  latestPriceKey,
  PRICE_UPDATES_STREAM_KEY,
  PRICE_UPDATES_STREAM_MAXLEN,
  sparklineKey,
  sparklineMember,
  type PriceEvent,
} from "@stock-platform/types";
import { APPLY_TICK_LUA } from "./apply-tick.lua.js";

/**
 * Lifetime of the idempotency marker. It only has to outlive the longest
 * plausible Kafka redelivery window; without it every tick leaves a permanent key.
 */
const PROCESSED_MARKER_TTL_SECONDS = 86_400;

/** How many recent prices a sparkline keeps. */
const SPARKLINE_POINTS = 30;

function processedMarkerKey(idempotencyKey: string): string {
  return `consumer:processed:${idempotencyKey}`;
}

declare module "ioredis" {
  interface RedisCommander<Context> {
    /** See `APPLY_TICK_LUA` for the keys, arguments and results. */
    applyTick(
      latestKey: string,
      sparklineKey: string,
      streamKey: string,
      markerKey: string,
      ...argv: string[]
    ): Result<string, Context>;
  }
}

/**
 * What Postgres knows about a symbol before a tick, for a cold start. `null`
 * values are unknown: no earlier tick at all, or none yet in this session.
 */
export type SessionBaseline = {
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

export type ApplyTickResult = "duplicate" | "older" | "applied";

/** The tick, with the session the market calendar put it in. */
export type SessionTick = {
  event: PriceEvent;
  sessionId: string;
};

function argOf(value: number | null): string {
  return value === null ? "" : String(value);
}

export class PriceRedisRepository {
  constructor(private readonly redis: Redis) {
    redis.defineCommand("applyTick", { numberOfKeys: 4, lua: APPLY_TICK_LUA });
  }

  /**
   * Applies `tick` atomically. `loadBaseline` is called only when Redis has no
   * usable record for the symbol; the script then runs once more with it.
   */
  async applyTick(
    tick: SessionTick,
    idempotencyKey: string,
    loadBaseline: () => Promise<SessionBaseline>,
  ): Promise<ApplyTickResult> {
    const first = await this.run(tick, idempotencyKey, null);
    if (first !== "needs_baseline") {
      return first;
    }
    const baseline = await loadBaseline();
    const second = await this.run(tick, idempotencyKey, baseline);
    if (second === "needs_baseline") {
      throw new Error(`apply-tick asked for a baseline twice for ${idempotencyKey}`);
    }
    return second;
  }

  private async run(
    { event, sessionId }: SessionTick,
    idempotencyKey: string,
    baseline: SessionBaseline | null,
  ): Promise<ApplyTickResult | "needs_baseline"> {
    const result = await this.redis.applyTick(
      latestPriceKey(event.symbol),
      sparklineKey(event.symbol),
      PRICE_UPDATES_STREAM_KEY,
      processedMarkerKey(idempotencyKey),
      event.symbol,
      event.name,
      String(event.price),
      String(event.size),
      event.side,
      String(event.timestamp),
      sessionId,
      String(PROCESSED_MARKER_TTL_SECONDS),
      sparklineMember(event.timestamp, event.price),
      String(SPARKLINE_POINTS),
      String(PRICE_UPDATES_STREAM_MAXLEN),
      baseline === null ? "0" : "1",
      argOf(baseline?.previousClose ?? null),
      argOf(baseline?.open ?? null),
      argOf(baseline?.high ?? null),
      argOf(baseline?.low ?? null),
      argOf(baseline?.volume ?? null),
    );
    switch (result) {
      case "duplicate":
      case "older":
      case "applied":
      case "needs_baseline":
        return result;
      default:
        throw new Error(`apply-tick returned an unknown result: ${String(result)}`);
    }
  }
}
