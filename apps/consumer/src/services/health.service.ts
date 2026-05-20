import { pingPool } from "@stock-platform/db";
import { pingRedis } from "@stock-platform/redis";
import type { ReadinessCheck } from "@stock-platform/schemas";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { ConsumerHealthStatus } from "../models/health.js";

export class HealthService {
  private status: ConsumerHealthStatus = {
    status: "starting",
    messagesProcessed: 0,
    lastMessageAt: null,
  };

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
  ) {}

  getStatus(): ConsumerHealthStatus {
    return this.status;
  }

  recordMessageProcessed(): void {
    this.status = {
      status: "healthy",
      messagesProcessed: this.status.messagesProcessed + 1,
      lastMessageAt: Date.now(),
    };
  }

  async checkReadiness(): Promise<{ ok: boolean; checks: ReadinessCheck }> {
    const [db, redis] = await Promise.all([pingPool(this.db), pingRedis(this.redis)]);
    const checks: ReadinessCheck = { db, redis };
    const ok = db && redis;
    return { ok, checks };
  }
}
