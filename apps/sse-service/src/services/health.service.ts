import { pingRedis } from "@stock-platform/redis";
import type { ReadinessCheck } from "@stock-platform/schemas";
import type { Redis } from "ioredis";
import type { StreamHub } from "./stream-hub.service.js";

export class HealthService {
  constructor(
    private readonly redis: Redis,
    private readonly streamHub: StreamHub,
  ) {}

  /** Not ready when Redis does not answer, or the shared stream reader has been down too long (S2 step 6). */
  async checkReadiness(): Promise<{ ok: boolean; checks: ReadinessCheck }> {
    const redis = await pingRedis(this.redis);
    const streamReader = this.streamHub.isReaderHealthy();
    const checks: ReadinessCheck = { redis, streamReader };
    return { ok: redis && streamReader, checks };
  }
}
