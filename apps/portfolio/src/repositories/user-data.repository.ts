import type { Pool } from "pg";
import { lockUser, withTransaction } from "./transaction.js";
import type { WatchlistRepository } from "./watchlist.repository.js";

function userIdOf(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const id: unknown = Reflect.get(row, "user_id");
  return typeof id === "string" ? id : null;
}

/**
 * Everything the portfolio service keeps per user, for account deletion (K6). Every table with
 * a `user_id` must be listed here and in {@link listUserIds}: P2 and P3 add theirs.
 */
export class UserDataRepository {
  constructor(
    private readonly db: Pool,
    private readonly watchlist: WatchlistRepository,
  ) {}

  /** Deletes all of the user's rows in one transaction. Rows already gone are not an error. */
  async deleteUser(userId: string): Promise<number> {
    return withTransaction(this.db, async (client) => {
      await lockUser(client, userId);
      return this.watchlist.deleteUser(client, userId);
    });
  }

  /** Every user who has any row here. */
  async listUserIds(): Promise<string[]> {
    const result = await this.db.query("SELECT DISTINCT user_id::text AS user_id FROM watchlist_items");
    return result.rows.map(userIdOf).filter((id): id is string => id !== null);
  }
}
