import { pingRedis } from "@stock-platform/redis";
import type { ReadinessCheck } from "@stock-platform/schemas";
import type { Redis } from "ioredis";

export class HealthService {
  constructor(private readonly redis: Redis) {}

  async checkReadiness(): Promise<{ ok: boolean; checks: ReadinessCheck }> {
    const redis = await pingRedis(this.redis);
    return { ok: redis, checks: { redis } };
  }
}
