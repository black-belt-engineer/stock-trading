/**
 * Core message flowing through the pipeline (ingest → Pub/Sub → consumer → Redis / DB).
 */
export type PriceEvent = {
  symbol: string;
  name: string;
  price: number;
  previousPrice: number;
  changePercent: number;
  volume: number;
  timestamp: number;
  source: "fake" | "polygon" | "yahoo" | "exchange";
  size: number;
  side: "buy" | "sell";
  exchange: string;
  conditions: string[];
};

/**
 * Denormalized latest quote stored in Redis per symbol.
 */
export type LatestPrice = {
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
 * OHLCV candle for charting (Phase 3).
 */
export type OhlcvBar = {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: "1m" | "5m" | "1h" | "1d";
};

/**
 * Payload streamed to browsers via SSE.
 */
export type StreamQuote = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
};
