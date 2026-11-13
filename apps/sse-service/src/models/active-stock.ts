import type { Exchange, Sector } from "@stock-platform/symbols";

/**
 * One entry of the discovery list. A registered symbol with no ticks yet has
 * `null` prices and `lastUpdated`, never zeros, so clients cannot mistake it
 * for a $0.00 quote.
 */
export type ActiveStock = {
  symbol: string;
  name: string;
  sector: Sector;
  exchange: Exchange;
  currentPrice: number | null;
  changePercent: number | null;
  changeValue: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  lastUpdated: number | null;
  sparkline: number[];
};
