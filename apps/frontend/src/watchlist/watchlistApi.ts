import { apiFetch, LoggedOutError } from "../api";
import type { ApiFetch } from "../api/client";
import { isRecord } from "../utils/guards";

/** One watched symbol. `listed` is false once it has left the registry. */
export type WatchlistEntry = { symbol: string; listed: boolean };

/**
 * How a write ended. `full`: the server's cap (409). `unknown`: the symbol is not in the
 * registry (404). `loggedOut`: the session ended; the route guard takes over. `failed`:
 * anything else (network, 5xx, 400).
 */
export type WriteResult = "ok" | "full" | "unknown" | "loggedOut" | "failed";

export type WatchlistApi = {
  /** The list in the user's order; throws when it cannot be loaded. */
  load: () => Promise<WatchlistEntry[]>;
  add: (symbol: string) => Promise<WriteResult>;
  remove: (symbol: string) => Promise<WriteResult>;
  saveOrder: (symbols: readonly string[]) => Promise<WriteResult>;
};

function parseEntry(value: unknown): WatchlistEntry | null {
  if (!isRecord(value) || typeof value.symbol !== "string" || value.symbol === "") return null;
  return { symbol: value.symbol, listed: value.listed !== false };
}

/** The `GET /portfolio/watchlist` body; malformed entries are dropped, a malformed body throws. */
export function parseWatchlist(body: unknown): WatchlistEntry[] {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new Error("Malformed watchlist response");
  return body.items.map(parseEntry).filter((entry): entry is WatchlistEntry => entry !== null);
}

function resultOf(status: number): WriteResult {
  if (status >= 200 && status < 300) return "ok";
  if (status === 409) return "full";
  if (status === 404) return "unknown";
  return "failed";
}

async function write(fetchImpl: ApiFetch, path: string, init: RequestInit): Promise<WriteResult> {
  try {
    return resultOf((await fetchImpl(path, init)).status);
  } catch (error) {
    return error instanceof LoggedOutError ? "loggedOut" : "failed";
  }
}

const itemPath = (symbol: string): string => `/portfolio/watchlist/${encodeURIComponent(symbol)}`;

/** The portfolio service's watchlist endpoints, through the BFF (P1). */
export function createWatchlistApi(fetchImpl: ApiFetch = apiFetch): WatchlistApi {
  return {
    load: async () => {
      const response = await fetchImpl("/portfolio/watchlist");
      if (!response.ok) throw new Error(`Watchlist request failed: ${response.status}`);
      return parseWatchlist(await response.json());
    },
    add: (symbol) => write(fetchImpl, itemPath(symbol), { method: "PUT" }),
    remove: (symbol) => write(fetchImpl, itemPath(symbol), { method: "DELETE" }),
    saveOrder: (symbols) =>
      write(fetchImpl, "/portfolio/watchlist/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      }),
  };
}
