import type { ActiveStock } from "../types";

/** The values the dashboard can sort by. `change` is the day change in percent (`changePercent`). */
export type SortKey = "symbol" | "price" | "change" | "volume";
export type SortDirection = "asc" | "desc";
export type QuoteSort = { key: SortKey; direction: SortDirection };

/** No `?sort=` in the URL means this. */
export const DEFAULT_SORT: QuoteSort = { key: "symbol", direction: "asc" };

/** Every sort the control offers, in its order. A table header click always lands on one of these. */
export const SORT_OPTIONS: ReadonlyArray<{ sort: QuoteSort; label: string }> = [
  { sort: { key: "symbol", direction: "asc" }, label: "Symbol A–Z" },
  { sort: { key: "symbol", direction: "desc" }, label: "Symbol Z–A" },
  { sort: { key: "price", direction: "desc" }, label: "Price, high to low" },
  { sort: { key: "price", direction: "asc" }, label: "Price, low to high" },
  { sort: { key: "change", direction: "desc" }, label: "Day change, high to low" },
  { sort: { key: "change", direction: "asc" }, label: "Day change, low to high" },
  { sort: { key: "volume", direction: "desc" }, label: "Volume, high to low" },
  { sort: { key: "volume", direction: "asc" }, label: "Volume, low to high" },
];

const SORT_KEYS: readonly SortKey[] = ["symbol", "price", "change", "volume"];

function isSortKey(value: string): value is SortKey {
  return SORT_KEYS.some((key) => key === value);
}

/** The URL value of a sort, for example `price-desc`. */
export function sortParam(sort: QuoteSort): string {
  return `${sort.key}-${sort.direction}`;
}

/** Reads `?sort=`. Anything it does not recognise is the default, never an error. */
export function parseSort(raw: string | null): QuoteSort {
  if (raw === null) return DEFAULT_SORT;
  const [key, direction, ...rest] = raw.split("-");
  if (rest.length > 0 || key === undefined || !isSortKey(key)) return DEFAULT_SORT;
  if (direction !== "asc" && direction !== "desc") return DEFAULT_SORT;
  return { key, direction };
}

export function sameSort(a: QuoteSort, b: QuoteSort): boolean {
  return a.key === b.key && a.direction === b.direction;
}

/** The first direction a column sorts in: symbols A–Z, numbers largest first. */
export function defaultDirection(key: SortKey): SortDirection {
  return key === "symbol" ? "asc" : "desc";
}

/** Trims and lower-cases a search query; the empty string matches everything. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Whether a stock matches a normalised query: its symbol starts with it, or its
 * company name contains it, ignoring case. Kept on its own so fuzzy matching can
 * replace it later.
 */
export function matchesQuery(stock: ActiveStock, query: string): boolean {
  if (query === "") return true;
  return stock.symbol.toLowerCase().startsWith(query) || stock.name.toLowerCase().includes(query);
}

function compareSymbols(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortValue(stock: ActiveStock, key: Exclude<SortKey, "symbol">): number | null {
  switch (key) {
    case "price":
      return stock.currentPrice;
    case "change":
      return stock.changePercent;
    case "volume":
      return stock.volume;
  }
}

/**
 * A comparator for the sort. Symbols without the value (no tick yet) come last
 * in either direction; ties fall back to the symbol A–Z, so the order is
 * deterministic.
 */
export function compareStocks(sort: QuoteSort): (a: ActiveStock, b: ActiveStock) => number {
  const sign = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "symbol") return (a, b) => sign * compareSymbols(a.symbol, b.symbol);
  const key = sort.key;
  return (a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
      return compareSymbols(a.symbol, b.symbol);
    }
    return x === y ? compareSymbols(a.symbol, b.symbol) : sign * (x - y);
  };
}

/** Search, then sort; the caller has already applied the sector filter. Returns a new array. */
export function searchAndSort(stocks: ActiveStock[], query: string, sort: QuoteSort): ActiveStock[] {
  const normalised = normaliseQuery(query);
  return stocks.filter((s) => matchesQuery(s, normalised)).sort(compareStocks(sort));
}
