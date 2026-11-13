import type { ActiveStock } from "../types";

export type Mover = { symbol: string; changePercent: number };

export type Movers = { gainers: Mover[]; losers: Mover[] };

/** Change percent as it is displayed (two decimals), so +0.004% is not listed as a gainer showing "+0.00%". */
function displayedPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The biggest day gainers and losers among `stocks`, at most `limit` each.
 * Only a symbol that is actually up is a gainer and only one that is down is a
 * loser, so with few symbols none appears in both lists, and at the start of a
 * session (every change zero) both lists are empty. Ties are broken by symbol,
 * so equal values do not swap places between updates.
 */
export function topMovers(stocks: readonly ActiveStock[], limit: number): Movers {
  const priced: Mover[] = [];
  for (const stock of stocks) {
    if (stock.changePercent !== null) {
      priced.push({ symbol: stock.symbol, changePercent: displayedPercent(stock.changePercent) });
    }
  }
  const bySymbol = (a: Mover, b: Mover): number => a.symbol.localeCompare(b.symbol);
  const gainers = priced
    .filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent || bySymbol(a, b))
    .slice(0, limit);
  const losers = priced
    .filter((m) => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent || bySymbol(a, b))
    .slice(0, limit);
  return { gainers, losers };
}

/** A key that changes only when what the strip shows changes. */
export function moversKey({ gainers, losers }: Movers): string {
  const part = (list: Mover[]): string => list.map((m) => `${m.symbol}:${m.changePercent}`).join(",");
  return `${part(gainers)}|${part(losers)}`;
}
