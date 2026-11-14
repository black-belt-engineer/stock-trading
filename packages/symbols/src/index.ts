/**
 * The one list of symbols the platform knows. The ingestor simulates a price
 * for each row and the SSE service serves and streams exactly these; the
 * frontend learns them from `/quotes/discovery/active-stocks`.
 *
 * Adding a symbol is one row below. A symbol removed from the list leaves its
 * keys in Redis and rows in Postgres behind; nothing reads them any more.
 */

export type Sector =
  | "Communication Services"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Energy"
  | "Financials"
  | "Health Care"
  | "Technology";

export type Exchange = "NASDAQ" | "NYSE";

export type SymbolInfo = {
  symbol: string;
  name: string;
  sector: Sector;
  exchange: Exchange;
  /** Starting price for the simulated feed, in USD. */
  seed: number;
};

export const SYMBOL_REGISTRY: readonly SymbolInfo[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", seed: 228.5 },
  { symbol: "TSLA", name: "Tesla, Inc.", sector: "Consumer Discretionary", exchange: "NASDAQ", seed: 248.0 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", exchange: "NASDAQ", seed: 175.2 },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology", exchange: "NASDAQ", seed: 418.0 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Discretionary", exchange: "NASDAQ", seed: 198.5 },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", exchange: "NASDAQ", seed: 124.0 },
  { symbol: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", exchange: "NASDAQ", seed: 570.0 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", exchange: "NYSE", seed: 215.0 },
  { symbol: "BAC", name: "Bank of America Corporation", sector: "Financials", exchange: "NYSE", seed: 41.5 },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", exchange: "NYSE", seed: 280.0 },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", sector: "Financials", exchange: "NYSE", seed: 455.0 },
  { symbol: "XOM", name: "Exxon Mobil Corporation", sector: "Energy", exchange: "NYSE", seed: 118.0 },
  { symbol: "CVX", name: "Chevron Corporation", sector: "Energy", exchange: "NYSE", seed: 155.0 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Health Care", exchange: "NYSE", seed: 158.0 },
  { symbol: "UNH", name: "UnitedHealth Group Incorporated", sector: "Health Care", exchange: "NYSE", seed: 560.0 },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Health Care", exchange: "NYSE", seed: 28.5 },
  { symbol: "KO", name: "The Coca-Cola Company", sector: "Consumer Staples", exchange: "NYSE", seed: 70.0 },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", exchange: "NASDAQ", seed: 80.0 },
];

/**
 * What a ticker may look like: an upper-case letter, then up to nine letters,
 * digits, dots or dashes. Dots cover class shares such as `BRK.B`.
 */
export const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function isValidSymbolFormat(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}

const bySymbol = new Map(SYMBOL_REGISTRY.map((row) => [row.symbol, row]));

if (bySymbol.size !== SYMBOL_REGISTRY.length) {
  throw new Error("SYMBOL_REGISTRY lists a symbol more than once");
}
for (const row of SYMBOL_REGISTRY) {
  if (!isValidSymbolFormat(row.symbol)) {
    throw new Error(`SYMBOL_REGISTRY has a malformed symbol: ${row.symbol}`);
  }
}

/** The registry row for `symbol` (exact, upper case), or undefined when it is not listed. */
export function findSymbol(symbol: string): SymbolInfo | undefined {
  return bySymbol.get(symbol);
}

export { sessionEndFor, sessionIdFor, sessionStartFor } from "./market-calendar.js";
