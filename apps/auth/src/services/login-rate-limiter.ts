import { createHash } from "node:crypto";
import { AppError, RateLimitedError } from "@stock-platform/errors";
import { FixedWindowCounter } from "@stock-platform/redis";
import type { Redis } from "ioredis";

/** Limits decided for phase 10 (A3 step 9). */
const WINDOW_SECONDS = 15 * 60;
const ATTEMPTS_PER_IP = 20;
const FAILURES_PER_EMAIL = 5;

/** Keys never hold the plain address. Lower-cased like the users table's `lower(email)` index. */
const emailId = (email: string): string => createHash("sha256").update(email.toLowerCase()).digest("hex");

/** Redis down: refuse rather than let requests through uncounted (owner decision). */
async function orUnavailable<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch {
    throw new AppError("Rate limiting is unavailable, try again", 503, "RATE_LIMIT_UNAVAILABLE");
  }
}

/**
 * Login limits: every attempt counts against the IP; only failures count against the email,
 * from any IP, and a successful login clears them. A blocked email gets the same `429`
 * whether or not the account exists, because the count is kept per address, not per account.
 *
 * The email check and the later failure count are two steps, so parallel attempts can go a
 * few failures past the limit; the per-IP limit bounds that.
 */
export class LoginRateLimiter {
  private readonly perIp: FixedWindowCounter;
  private readonly perEmail: FixedWindowCounter;

  constructor(redis: Redis) {
    this.perIp = new FixedWindowCounter(redis, {
      prefix: "ratelimit:login:ip",
      limit: ATTEMPTS_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });
    this.perEmail = new FixedWindowCounter(redis, {
      prefix: "ratelimit:login:email",
      limit: FAILURES_PER_EMAIL,
      windowSeconds: WINDOW_SECONDS,
    });
  }

  /** Counts the attempt; throws `RateLimitedError` when the IP or the email is over its limit. */
  async beforeAttempt(ip: string, email: string): Promise<void> {
    const [byIp, byEmail] = await orUnavailable(Promise.all([this.perIp.hit(ip), this.perEmail.peek(emailId(email))]));
    const blocked = [byIp, byEmail].filter((state) => state.blocked);
    if (blocked.length > 0) {
      throw new RateLimitedError(Math.max(...blocked.map((state) => state.retryAfterSeconds)));
    }
  }

  async recordFailure(email: string): Promise<void> {
    await orUnavailable(this.perEmail.hit(emailId(email)));
  }

  async recordSuccess(email: string): Promise<void> {
    await orUnavailable(this.perEmail.reset(emailId(email)));
  }
}
