import type { Pool } from "pg";
import type { AlertRepository } from "./alert.repository.js";
import { lockUser, withTransaction } from "./transaction.js";
import type { WatchlistRepository } from "./watchlist.repository.js";

function userIdOf(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const id: unknown = Reflect.get(row, "user_id");
  return typeof id === "string" ? id : null;
}

/**
 * Everything the portfolio service keeps per user, for account deletion (K6). Every table with
 * a `user_id` must be listed here and in {@link listUserIds}: P3 adds its tables.
 */
export class UserDataRepository {
  constructor(
    private readonly db: Pool,
    private readonly watchlist: WatchlistRepository,
    private readonly alerts: AlertRepository,
  ) {}

  /** Deletes all of the user's rows in one transaction. Rows already gone are not an error. */
  async deleteUser(userId: string): Promise<number> {
    return withTransaction(this.db, async (client) => {
      await lockUser(client, userId);
      const watched = await this.watchlist.deleteUser(client, userId);
      const alerts = await this.alerts.deleteUser(client, userId);
      return watched + alerts;
    });
  }

  /** Every user who has any row here. */
  async listUserIds(): Promise<string[]> {
    const result = await this.db.query(`SELECT user_id::text AS user_id FROM watchlist_items
       UNION
       SELECT user_id::text AS user_id FROM price_alerts`);
    return result.rows.map(userIdOf).filter((id): id is string => id !== null);
  }
}
