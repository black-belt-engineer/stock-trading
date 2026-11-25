import type { Pool, PoolClient } from "pg";
import type { AlertDirection } from "../models/alert.js";
import { lockUser, withTransaction } from "./transaction.js";

export type AlertRow = {
  id: string;
  symbol: string;
  direction: AlertDirection;
  /** NUMERIC as Postgres prints it, two decimals. */
  threshold: string;
  createdAt: Date;
  triggeredAt: Date | null;
  triggeredPrice: string | null;
};

export type CreateResult = { ok: true; alert: AlertRow } | { ok: false; reason: "full" };

export type TriggerResult = { first: boolean; alert: AlertRow } | null;

// NUMERIC is read as text, so `pg` never turns it into a float. Columns in one place, so every
// query returns the same shape.
const COLUMNS = `id::text AS id, symbol, direction, threshold::text AS threshold, created_at,
  triggered_at, triggered_price::text AS triggered_price`;

function toRow(row: unknown): AlertRow | null {
  if (typeof row !== "object" || row === null) return null;
  const id: unknown = Reflect.get(row, "id");
  const symbol: unknown = Reflect.get(row, "symbol");
  const direction: unknown = Reflect.get(row, "direction");
  const threshold: unknown = Reflect.get(row, "threshold");
  const createdAt: unknown = Reflect.get(row, "created_at");
  const triggeredAt: unknown = Reflect.get(row, "triggered_at");
  const triggeredPrice: unknown = Reflect.get(row, "triggered_price");
  if (
    typeof id !== "string" ||
    typeof symbol !== "string" ||
    (direction !== "above" && direction !== "below") ||
    typeof threshold !== "string" ||
    !(createdAt instanceof Date)
  ) {
    return null;
  }
  return {
    id,
    symbol,
    direction,
    threshold,
    createdAt,
    triggeredAt: triggeredAt instanceof Date ? triggeredAt : null,
    triggeredPrice: typeof triggeredPrice === "string" ? triggeredPrice : null,
  };
}

function rowsOf(rows: readonly unknown[]): AlertRow[] {
  return rows.map(toRow).filter((row): row is AlertRow => row !== null);
}

function countOf(row: unknown): number {
  if (typeof row !== "object" || row === null) return 0;
  // count(*) is a bigint, which `pg` returns as a string.
  const value: unknown = Reflect.get(row, "count");
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `price_alerts` (P2): one row per alert, active while `triggered_at` is null. Every query filters
 * on `user_id`. Evaluation happens in the browser for now (Q7); a server worker could later read
 * the active rows by symbol and use the same conditional trigger, without a schema change.
 */
export class AlertRepository {
  constructor(private readonly db: Pool) {}

  async prepareSchema(): Promise<void> {
    // No foreign key: users live in Keycloak. Deleting a user's rows is K6's job.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
        threshold NUMERIC(18, 2) NOT NULL CHECK (threshold > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        triggered_at TIMESTAMPTZ NULL,
        triggered_price NUMERIC(18, 2) NULL
      );
      CREATE INDEX IF NOT EXISTS price_alerts_user_active
        ON price_alerts (user_id, created_at) WHERE triggered_at IS NULL;
      CREATE INDEX IF NOT EXISTS price_alerts_user_history
        ON price_alerts (user_id, triggered_at DESC) WHERE triggered_at IS NOT NULL;
    `);
  }

  /** Active alerts oldest first, then the newest `historyLimit` triggered ones. */
  async list(userId: string, historyLimit: number): Promise<{ active: AlertRow[]; history: AlertRow[] }> {
    const active = await this.db.query(
      `SELECT ${COLUMNS} FROM price_alerts
        WHERE user_id = $1 AND triggered_at IS NULL
        ORDER BY created_at, id`,
      [userId],
    );
    const history = await this.db.query(
      `SELECT ${COLUMNS} FROM price_alerts
        WHERE user_id = $1 AND triggered_at IS NOT NULL
        ORDER BY triggered_at DESC, id
        LIMIT $2`,
      [userId, historyLimit],
    );
    return { active: rowsOf(active.rows), history: rowsOf(history.rows) };
  }

  /**
   * Adds an active alert unless the user already has `limit` of them. The count and the insert
   * run under the user's lock, so two creates at once cannot both pass the cap.
   */
  async create(
    userId: string,
    alert: { symbol: string; direction: AlertDirection; threshold: string },
    limit: number,
  ): Promise<CreateResult> {
    return withTransaction(this.db, async (client) => {
      await lockUser(client, userId);
      const count = await client.query(
        "SELECT count(*) AS count FROM price_alerts WHERE user_id = $1 AND triggered_at IS NULL",
        [userId],
      );
      if (countOf(count.rows[0]) >= limit) {
        return { ok: false, reason: "full" };
      }
      const inserted = await client.query(
        `INSERT INTO price_alerts (user_id, symbol, direction, threshold)
         VALUES ($1, $2, $3, $4::numeric)
         RETURNING ${COLUMNS}`,
        [userId, alert.symbol, alert.direction, alert.threshold],
      );
      const row = toRow(inserted.rows[0]);
      if (!row) throw new Error("INSERT … RETURNING gave no alert row");
      return { ok: true, alert: row };
    });
  }

  /** Removes an alert, active or triggered. Not there (or another user's) is not an error. */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.query("DELETE FROM price_alerts WHERE user_id = $1 AND id = $2", [userId, id]);
  }

  async find(userId: string, id: string): Promise<AlertRow | null> {
    const result = await this.db.query(`SELECT ${COLUMNS} FROM price_alerts WHERE user_id = $1 AND id = $2`, [
      userId,
      id,
    ]);
    return toRow(result.rows[0]);
  }

  /**
   * Marks the alert triggered at `price`, only if it is still active. One statement, so of two
   * tabs (or devices) triggering at once exactly one gets `first: true`; the other gets the row
   * as the first one left it. `null`: no such alert for this user (deleted meanwhile).
   */
  async trigger(userId: string, id: string, price: string): Promise<TriggerResult> {
    const updated = await this.db.query(
      `UPDATE price_alerts
          SET triggered_at = now(), triggered_price = $3::numeric
        WHERE user_id = $1 AND id = $2 AND triggered_at IS NULL
        RETURNING ${COLUMNS}`,
      [userId, id, price],
    );
    const row = toRow(updated.rows[0]);
    if (row) return { first: true, alert: row };
    const existing = await this.find(userId, id);
    return existing ? { first: false, alert: existing } : null;
  }

  /** Every row of the user. Used by K6 when the account is deleted. */
  async deleteUser(client: PoolClient, userId: string): Promise<number> {
    const result = await client.query("DELETE FROM price_alerts WHERE user_id = $1", [userId]);
    return result.rowCount ?? 0;
  }
}
