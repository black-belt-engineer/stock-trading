import { pingPool } from "@stock-platform/db";
import { pingRedis } from "@stock-platform/redis";
import type { ReadinessCheck } from "@stock-platform/schemas";
import type { Redis } from "ioredis";
import type { Pool } from "pg";

export class HealthService {
  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
  ) {}

  async checkReadiness(): Promise<{ ok: boolean; checks: ReadinessCheck }> {
    const [db, redis] = await Promise.all([pingPool(this.db), pingRedis(this.redis)]);
    return { ok: db && redis, checks: { db, redis } };
  }
}
