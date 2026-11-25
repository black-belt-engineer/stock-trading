import { describe, expect, it } from "vitest";
import type { ActiveStock } from "../types";
import { DEFAULT_SORT, matchesQuery, normaliseQuery, parseSort, searchAndSort, sortParam, SORT_OPTIONS, starredFirst } from "./quoteView";

function stock(symbol: string, name: string, values: Partial<ActiveStock> = {}): ActiveStock {
  return {
    symbol,
    name,
    sector: "Technology",
    exchange: "NASDAQ",
    currentPrice: null,
    tickDirection: "flat",
    sparkline: [],
    lastUpdated: 0,
    sessionId: null,
    previousClose: null,
    open: null,
    high: null,
    low: null,
    volume: null,
    change: null,
    changePercent: null,
    ...values,
  };
}

const symbols = (list: ActiveStock[]): string[] => list.map((s) => s.symbol);

describe("parseSort", () => {
  it("reads every offered option back from its URL value", () => {
    for (const { sort } of SORT_OPTIONS) expect(parseSort(sortParam(sort))).toEqual(sort);
  });

  it("falls back to the default for anything else", () => {
    for (const raw of [null, "", "price", "price-up", "name-asc", "price-desc-x", "PRICE-DESC"]) {
      expect(parseSort(raw)).toEqual(DEFAULT_SORT);
    }
  });
});

describe("matchesQuery", () => {
  const msft = stock("MSFT", "Microsoft Corporation");
  const brk = stock("BRK.B", "Berkshire Hathaway Inc.");

  it("matches a symbol prefix and a name substring, ignoring case and outer spaces", () => {
    expect(matchesQuery(msft, normaliseQuery("ms"))).toBe(true);
    expect(matchesQuery(msft, normaliseQuery("  Micro "))).toBe(true);
    expect(matchesQuery(msft, normaliseQuery("corp"))).toBe(true);
    expect(matchesQuery(msft, normaliseQuery("sft"))).toBe(false);
  });

  it("handles symbols with dots", () => {
    expect(matchesQuery(brk, normaliseQuery("brk.b"))).toBe(true);
    expect(matchesQuery(brk, normaliseQuery("BRK."))).toBe(true);
    expect(matchesQuery(brk, normaliseQuery("brkb"))).toBe(false);
  });

  it("matches everything with an empty or blank query", () => {
    expect(matchesQuery(msft, normaliseQuery("   "))).toBe(true);
  });
});

describe("searchAndSort", () => {
  const list = [
    stock("NVDA", "NVIDIA Corporation", { currentPrice: 124, changePercent: 1.5, volume: 300 }),
    stock("AAPL", "Apple Inc.", { currentPrice: 228.5, changePercent: -0.4, volume: 100 }),
    stock("ORCL", "Oracle Corporation"),
    stock("MSFT", "Microsoft Corporation", { currentPrice: 418, changePercent: 1.5, volume: 100 }),
  ];

  it("sorts by symbol in both directions", () => {
    expect(symbols(searchAndSort(list, "", { key: "symbol", direction: "asc" }))).toEqual(["AAPL", "MSFT", "NVDA", "ORCL"]);
    expect(symbols(searchAndSort(list, "", { key: "symbol", direction: "desc" }))).toEqual(["ORCL", "NVDA", "MSFT", "AAPL"]);
  });

  it("sorts by price and puts symbols without one last in both directions", () => {
    expect(symbols(searchAndSort(list, "", { key: "price", direction: "desc" }))).toEqual(["MSFT", "AAPL", "NVDA", "ORCL"]);
    expect(symbols(searchAndSort(list, "", { key: "price", direction: "asc" }))).toEqual(["NVDA", "AAPL", "MSFT", "ORCL"]);
  });

  it("breaks ties by symbol A–Z whatever the direction", () => {
    expect(symbols(searchAndSort(list, "", { key: "change", direction: "desc" }))).toEqual(["MSFT", "NVDA", "AAPL", "ORCL"]);
    expect(symbols(searchAndSort(list, "", { key: "change", direction: "asc" }))).toEqual(["AAPL", "MSFT", "NVDA", "ORCL"]);
    expect(symbols(searchAndSort(list, "", { key: "volume", direction: "asc" }))).toEqual(["AAPL", "MSFT", "NVDA", "ORCL"]);
  });

  it("searches before sorting and does not change its input", () => {
    const before = symbols(list);
    expect(symbols(searchAndSort(list, "corporation", { key: "price", direction: "desc" }))).toEqual(["MSFT", "NVDA", "ORCL"]);
    expect(symbols(list)).toEqual(before);
  });
});

describe("starredFirst", () => {
  const list = ["AAPL", "BAC", "KO", "MSFT", "V"].map((s) => stock(s, s));
  it("puts starred symbols first in watchlist order and keeps the rest as given", () => {
    expect(symbols(starredFirst(list, ["V", "BAC"]))).toEqual(["V", "BAC", "AAPL", "KO", "MSFT"]);
  });
  it("ignores watched symbols that are not in the list", () => {
    expect(symbols(starredFirst(list, ["GONE", "KO"]))).toEqual(["KO", "AAPL", "BAC", "MSFT", "V"]);
    expect(symbols(starredFirst(list, []))).toEqual(symbols(list));
  });
});
