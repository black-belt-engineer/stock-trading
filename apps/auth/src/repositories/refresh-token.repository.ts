import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import { Value } from "@sinclair/typebox/value";
import { userSummarySchema, type UserSummary } from "../models/auth.js";

// Only a hash of the opaque token is stored, so a Redis leak does not expose usable tokens.
const key = (token: string): string =>
  `auth:refresh:${createHash("sha256").update(token).digest("hex")}`;

export class RefreshTokenRepository {
  constructor(private readonly redis: Redis) {}

  async save(token: string, user: UserSummary, ttlSeconds: number): Promise<void> {
    await this.redis.set(key(token), JSON.stringify(user), "EX", ttlSeconds);
  }

  /** Atomically reads and deletes the token (single use, enables rotation). */
  async consume(token: string): Promise<UserSummary | null> {
    const value = await this.redis.getdel(key(token));
    if (!value) return null;
    // A stored entry that is not valid JSON or not a user counts as an unknown token.
    let user: unknown;
    try {
      user = JSON.parse(value);
    } catch {
      return null;
    }
    return Value.Check(userSummarySchema, user) ? user : null;
  }

  async delete(token: string): Promise<void> {
    await this.redis.del(key(token));
  }
}
