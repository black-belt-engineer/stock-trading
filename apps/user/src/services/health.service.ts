import { pingPool } from "@stock-platform/db";
import type { ReadinessCheck } from "@stock-platform/schemas";
import type { Pool } from "pg";

export class HealthService {
  constructor(private readonly db: Pool) {}

  async checkReadiness(): Promise<{ ok: boolean; checks: ReadinessCheck }> {
    const db = await pingPool(this.db);
    return { ok: db, checks: { db } };
  }
}
