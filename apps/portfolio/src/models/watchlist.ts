/** Most symbols one user can watch. A further add gets `409`. */
export const WATCHLIST_LIMIT = 100;

export type WatchlistItem = {
  symbol: string;
  /** When the symbol was starred, ISO 8601. */
  addedAt: string;
  /** False once the symbol has left the registry: kept, but not shown in the grid. */
  listed: boolean;
};

export type WatchlistResponse = {
  /** In the user's order. */
  items: WatchlistItem[];
};

export type OrderResult =
  | { ok: true; order: string[] }
  | { ok: false; unknown: string[] };

/**
 * The new order of a watchlist from a reorder request. The request must not name a symbol that is
 * not on the list (`unknown`). Watched symbols it leaves out (added on another device since the
 * client last loaded the list) keep their relative order after the requested ones, so the result
 * is always the whole list, each symbol once. Duplicates are rejected before this is called.
 */
export function mergeOrder(current: readonly string[], requested: readonly string[]): OrderResult {
  const watched = new Set(current);
  const unknown = requested.filter((symbol) => !watched.has(symbol));
  if (unknown.length > 0) {
    return { ok: false, unknown };
  }
  const named = new Set(requested);
  return { ok: true, order: [...requested, ...current.filter((symbol) => !named.has(symbol))] };
}

/** The symbols that appear more than once, each named once. */
export function duplicatesIn(symbols: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const symbol of symbols) {
    if (seen.has(symbol)) repeated.add(symbol);
    seen.add(symbol);
  }
  return [...repeated];
}
