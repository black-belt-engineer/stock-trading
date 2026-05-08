export type LiveQuote = {
  symbol: string;
  name: string;
  price: number;
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

export type ActiveStock = {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  changeValue: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[];
  lastUpdated: number;
};
