/** How the last tick moved the price against the tick before. Drives the card's flash only. */
export type TickDirection = "up" | "down" | "flat";

/**
 * The day values of a symbol's current session. `change` and `changePercent`
 * are against `previousClose`. Every field is `null` until the symbol's first
 * tick; show "—" for them, never $0.00. A quote with a new `sessionId` replaces
 * them all: the client never computes its own.
 */
export type DayValues = {
  sessionId: string | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
};

export type LiveQuote = DayValues & {
  symbol: string;
  name: string;
  price: number;
  tickDirection: TickDirection;
  /** Shares in the trade. */
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
};

export type FeedEvent = LiveQuote & {
  id: string;
};

/**
 * One symbol on the dashboard. The price fields are `null` until the symbol's
 * first tick; show "—" for them, never $0.00.
 */
export type ActiveStock = DayValues & {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  currentPrice: number | null;
  tickDirection: TickDirection;
  sparkline: number[];
  /** Time of the latest tick applied (epoch ms), or 0 when there has been none. */
  lastUpdated: number;
};

/** State of the request for the list of symbols the dashboard shows. */
export type ListStatus = "loading" | "ready" | "error";
