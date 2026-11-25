import { ConflictError, ValidationError } from "@stock-platform/errors";
import { isListed, normaliseSymbol, resolveSymbol } from "../models/symbols.js";
import { duplicatesIn, WATCHLIST_LIMIT, type WatchlistResponse } from "../models/watchlist.js";
import type { WatchlistRepository } from "../repositories/watchlist.repository.js";

export class WatchlistService {
  constructor(private readonly repository: WatchlistRepository) {}

  async list(userId: string): Promise<WatchlistResponse> {
    const rows = await this.repository.list(userId);
    return {
      items: rows.map((row) => ({
        symbol: row.symbol,
        addedAt: row.addedAt.toISOString(),
        listed: isListed(row.symbol),
      })),
    };
  }

  /** Idempotent: adding a symbol that is already there succeeds and changes nothing. */
  async add(userId: string, rawSymbol: string): Promise<void> {
    // Only registered symbols can be added (400 malformed, 404 unknown).
    const { symbol } = resolveSymbol(rawSymbol);
    const result = await this.repository.add(userId, symbol, WATCHLIST_LIMIT);
    if (result === "full") {
      throw new ConflictError(`The watchlist is full (${WATCHLIST_LIMIT} symbols)`);
    }
  }

  /**
   * Idempotent. Any well-formed symbol is accepted, also one that has left the registry: that is
   * how a user removes it from the manage view.
   */
  async remove(userId: string, rawSymbol: string): Promise<void> {
    await this.repository.remove(userId, normaliseSymbol(rawSymbol));
  }

  /** `400` for a malformed or repeated symbol, or one that is not on the list. */
  async reorder(userId: string, rawSymbols: readonly string[]): Promise<void> {
    const symbols = rawSymbols.map(normaliseSymbol);
    const duplicates = duplicatesIn(symbols);
    if (duplicates.length > 0) {
      throw new ValidationError(`Symbols listed more than once: ${duplicates.join(", ")}`);
    }
    const result = await this.repository.reorder(userId, symbols);
    if (!result.ok) {
      throw new ValidationError(`Not on the watchlist: ${result.unknown.join(", ")}`);
    }
  }
}
