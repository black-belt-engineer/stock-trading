export type LiveQuote = {
  symbol: string;
  name: string;
  price: number;
  /** Absent only when the server predates the field; the last known value is kept then. */
  changeValue?: number;
  changePercent: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
};

export type FeedEvent = LiveQuote & {
  id: string;
};

export type SnapshotData = {
  symbol: string;
  name: string;
  currentPrice: number;
  previousPrice: number;
  changeValue: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
};

/**
 * One symbol on the dashboard. The price fields are `null` until the symbol's
 * first tick; show "—" for them, never $0.00.
 */
export type ActiveStock = {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  currentPrice: number | null;
  changePercent: number | null;
  changeValue: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  sparkline: number[];
  /** Time of the latest tick applied (epoch ms), or 0 when there has been none. */
  lastUpdated: number;
};

/** State of the request for the list of symbols the dashboard shows. */
export type ListStatus = "loading" | "ready" | "error";
