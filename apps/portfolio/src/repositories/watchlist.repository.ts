import type { Pool, PoolClient } from "pg";
import { mergeOrder } from "../models/watchlist.js";
import { lockUser, withTransaction } from "./transaction.js";

export type WatchlistRow = {
  symbol: string;
  addedAt: Date;
};

export type AddResult = "added" | "exists" | "full";

export type ReorderResult = { ok: true } | { ok: false; unknown: string[] };

function toRow(row: unknown): WatchlistRow | null {
  if (typeof row !== "object" || row === null) return null;
  const symbol: unknown = Reflect.get(row, "symbol");
  const createdAt: unknown = Reflect.get(row, "created_at");
  if (typeof symbol !== "string" || !(createdAt instanceof Date)) return null;
  return { symbol, addedAt: createdAt };
}

function symbolOf(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const symbol: unknown = Reflect.get(row, "symbol");
  return typeof symbol === "string" ? symbol : null;
}

function countOf(row: unknown): number {
  if (typeof row !== "object" || row === null) return 0;
  // count(*) is a bigint, which `pg` returns as a string.
  const value: unknown = Reflect.get(row, "count");
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `watchlist_items`: one row per starred symbol. Every query filters on `user_id`. */
export class WatchlistRepository {
  constructor(private readonly db: Pool) {}

  async prepareSchema(): Promise<void> {
    // No foreign key: users live in Keycloak. Deleting a user's rows is K6's job.
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        user_id UUID NOT NULL,
        symbol TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, symbol)
      );
    `);
  }

  /** The user's symbols in their order. Ties (none in practice) fall back to when they were added. */
  async list(userId: string): Promise<WatchlistRow[]> {
    const result = await this.db.query(
      `SELECT symbol, created_at FROM watchlist_items
        WHERE user_id = $1
        ORDER BY position, created_at, symbol`,
      [userId],
    );
    return result.rows.map(toRow).filter((row): row is WatchlistRow => row !== null);
  }

  /** Adds `symbol` at the end. Already there is not an error; a full list is (`limit` rows). */
  async add(userId: string, symbol: string, limit: number): Promise<AddResult> {
    return withTransaction(this.db, async (client) => {
      await lockUser(client, userId);
      const existing = await client.query(
        "SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2",
        [userId, symbol],
      );
      if (existing.rowCount !== null && existing.rowCount > 0) {
        return "exists";
      }
      const count = await client.query("SELECT count(*) AS count FROM watchlist_items WHERE user_id = $1", [userId]);
      if (countOf(count.rows[0]) >= limit) {
        return "full";
      }
      await client.query(
        `INSERT INTO watchlist_items (user_id, symbol, position)
         SELECT $1, $2, COALESCE(MAX(position) + 1, 0) FROM watchlist_items WHERE user_id = $1`,
        [userId, symbol],
      );
      return "added";
    });
  }

  /** Removes `symbol`. Not on the list is not an error. Positions may have gaps; only their order counts. */
  async remove(userId: string, symbol: string): Promise<void> {
    await this.db.query("DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
  }

  /** Rewrites every position from `requested` (see {@link mergeOrder}). */
  async reorder(userId: string, requested: readonly string[]): Promise<ReorderResult> {
    return withTransaction(this.db, async (client) => {
      await lockUser(client, userId);
      const current = await this.currentOrder(client, userId);
      const merged = mergeOrder(current, requested);
      if (!merged.ok) {
        return merged;
      }
      await client.query(
        `UPDATE watchlist_items AS w
            SET position = o.position - 1
           FROM unnest($2::text[]) WITH ORDINALITY AS o(symbol, position)
          WHERE w.user_id = $1 AND w.symbol = o.symbol`,
        [userId, merged.order],
      );
      return { ok: true };
    });
  }

  /** Every row of the user. Used by K6 when the account is deleted. */
  async deleteUser(client: PoolClient, userId: string): Promise<number> {
    const result = await client.query("DELETE FROM watchlist_items WHERE user_id = $1", [userId]);
    return result.rowCount ?? 0;
  }

  private async currentOrder(client: PoolClient, userId: string): Promise<string[]> {
    const result = await client.query(
      "SELECT symbol FROM watchlist_items WHERE user_id = $1 ORDER BY position, created_at, symbol",
      [userId],
    );
    return result.rows.map(symbolOf).filter((symbol): symbol is string => symbol !== null);
  }
}
