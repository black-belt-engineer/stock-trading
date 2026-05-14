export type AppEnv = {
  REDIS_URL: string;
  PORT: number;
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
  lastUpdated: number;
  sparkline: number[];
};
