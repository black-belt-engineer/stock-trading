import type { Redis } from "ioredis";

const key = (jti: string): string => `auth:revoked:${jti}`;

export class TokenBlocklistRepository {
  constructor(private readonly redis: Redis) {}

  /** Blocks a token id until it would have expired anyway. */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    await this.redis.set(key(jti), "1", "EX", ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(key(jti))) === 1;
  }
}
