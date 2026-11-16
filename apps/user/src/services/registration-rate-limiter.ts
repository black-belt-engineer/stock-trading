import { AppError, RateLimitedError } from "@stock-platform/errors";
import { FixedWindowCounter } from "@stock-platform/redis";
import type { Redis } from "ioredis";

/** 5 registrations per IP per hour (A3 step 9). */
const REGISTRATIONS_PER_IP = 5;
const WINDOW_SECONDS = 60 * 60;

/** Every attempt counts, successful or not. Redis down refuses the request (owner decision). */
export class RegistrationRateLimiter {
  private readonly perIp: FixedWindowCounter;

  constructor(redis: Redis) {
    this.perIp = new FixedWindowCounter(redis, {
      prefix: "ratelimit:register:ip",
      limit: REGISTRATIONS_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });
  }

  async beforeAttempt(ip: string): Promise<void> {
    const state = await this.perIp.hit(ip).catch((): never => {
      throw new AppError("Rate limiting is unavailable, try again", 503, "RATE_LIMIT_UNAVAILABLE");
    });
    if (state.blocked) throw new RateLimitedError(state.retryAfterSeconds);
  }
}
