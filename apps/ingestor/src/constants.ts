export const SYMBOL_CONFIG = [
  { symbol: "AAPL", name: "Apple Inc.", seed: 228.5 },
  { symbol: "TSLA", name: "Tesla, Inc.", seed: 248.0 },
  { symbol: "GOOGL", name: "Alphabet Inc.", seed: 175.2 },
  { symbol: "MSFT", name: "Microsoft Corporation", seed: 418.0 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", seed: 198.5 },
  { symbol: "NVDA", name: "NVIDIA Corporation", seed: 124.0 },
] as const;

export type SymbolConfigRow = (typeof SYMBOL_CONFIG)[number];

export const STAGGER_MS = 200;
export const TICK_INTERVAL_MS = 1000;
export const RANDOM_WALK = 0.005;