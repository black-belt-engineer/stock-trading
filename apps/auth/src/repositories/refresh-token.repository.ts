import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { UserSummary } from "../models/auth.js";

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
    return value ? (JSON.parse(value) as UserSummary) : null;
  }

  async delete(token: string): Promise<void> {
    await this.redis.del(key(token));
  }
}
