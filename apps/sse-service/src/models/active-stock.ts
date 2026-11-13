import type { Exchange, Sector } from "@stock-platform/symbols";
import type { TickDirection } from "@stock-platform/types";

/**
 * One entry of the discovery list. A registered symbol with no ticks yet has
 * `null` prices and `lastUpdated`, never zeros, so clients cannot mistake it
 * for a $0.00 quote.
 *
 * The day values belong to `sessionId`; `change` and `changePercent` are
 * against `previousClose`.
 */
export type ActiveStock = {
  symbol: string;
  name: string;
  sector: Sector;
  exchange: Exchange;
  sessionId: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  tickDirection: TickDirection | null;
  lastUpdated: number | null;
  sparkline: number[];
};
