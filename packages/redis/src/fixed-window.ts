import type { Redis } from "ioredis";

export type FixedWindowOptions = {
  /** Key prefix; the counted id is appended after a colon. */
  prefix: string;
  /** Hits allowed in one window. */
  limit: number;
  windowSeconds: number;
};

export type WindowState = {
  /** Hits counted in the current window, this one included for `hit`. */
  count: number;
  /** The count is above the limit (`hit`) or has reached it (`peek`). */
  blocked: boolean;
  /** Seconds until the window ends; 0 when no window is open. */
  retryAfterSeconds: number;
};

/**
 * A fixed-window counter in Redis: `INCR`, with `EXPIRE … NX` so only the first hit of a
 * window sets its end. Both run in one `MULTI`, so a crash between them cannot leave a
 * counter without a TTL. Needs Redis 7 for `EXPIRE NX`.
 */
export class FixedWindowCounter {
  constructor(
    private readonly redis: Redis,
    private readonly options: FixedWindowOptions,
  ) {}

  private key(id: string): string {
    return `${this.options.prefix}:${id}`;
  }

  /** Counts one hit and reports whether it went over the limit. */
  async hit(id: string): Promise<WindowState> {
    const key = this.key(id);
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, this.options.windowSeconds, "NX")
      .ttl(key)
      .exec();
    if (!results) throw new Error("Redis transaction was aborted");
    for (const [err] of results) {
      if (err) throw err;
    }
    const count = Number(results[0]?.[1]);
    const ttl = Number(results[2]?.[1]);
    return {
      count,
      blocked: count > this.options.limit,
      retryAfterSeconds: ttl > 0 ? ttl : this.options.windowSeconds,
    };
  }

  /** Reads the current window without counting. */
  async peek(id: string): Promise<WindowState> {
    const key = this.key(id);
    const [count, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
    const n = count === null ? 0 : Number(count);
    return { count: n, blocked: n >= this.options.limit, retryAfterSeconds: ttl > 0 ? ttl : 0 };
  }

  async reset(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }
}
