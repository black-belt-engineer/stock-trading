import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { usePriceStream } from "../hooks/usePriceStream";
import type { StreamStatus } from "../hooks/usePriceStream";
import type { ActiveStock, FeedEvent, ListStatus, LiveQuote } from "../types";
import { useSymbolList } from "./useSymbolList";

/** How many recent prices a card's sparkline keeps. */
const SPARKLINE_POINTS = 30;

/** How long the stream may be down before the UI says so. Debounces a flapping connection. */
const STALE_AFTER_MS = 3000;

type StreamStatusValue = {
  status: StreamStatus;
  reconnectAttempts: number;
  /** When the next reconnect attempt is due (epoch ms), or null. */
  nextRetryAt: number | null;
  /** The stream has not been live for STALE_AFTER_MS: prices may be out of date. */
  stale: boolean;
  retry: () => void;
};

type StreamDataValue = {
  prices: Map<string, LiveQuote>;
  feed: FeedEvent[];
  /** Every symbol on the dashboard, with the live prices applied. */
  stocks: ActiveStock[];
  listStatus: ListStatus;
  retryList: () => void;
};

/*
 * Two contexts so that components which only show the connection state (the
 * sidebar) do not re-render on every tick, which the data context does.
 */
const StreamStatusContext = createContext<StreamStatusValue | null>(null);
const StreamDataContext = createContext<StreamDataValue | null>(null);

/**
 * Owns the symbol list and the one SSE connection for the whole app. It sits
 * above the routes, so navigating between pages neither refetches the list nor
 * closes and reopens the stream.
 *
 * The list comes first: the stream opens only once it is known which symbols
 * to ask for. An empty `symbols=` would make the server stream every default.
 */
export function StreamProvider({ children }: { children: ReactNode }): JSX.Element {
  const { stocks: listed, status: listStatus, retry: retryList } = useSymbolList();
  const symbols = useSymbolsOf(listed);
  const stream = usePriceStream(symbols);
  const { prices, feed, reconnectAttempts, nextRetryAt, retry } = stream;
  const stocks = useLiveStocks(listed, prices);

  // No list, so no stream to wait for: say so instead of "connecting" forever.
  const status = symbols === null && listStatus === "error" ? "disconnected" : stream.status;
  // Only a stream that was asked to open can be stale; a failed list has its own error state.
  const stale = useDebouncedFlag(symbols !== null && status !== "live", STALE_AFTER_MS);

  const statusValue = useMemo(
    () => ({ status, reconnectAttempts, nextRetryAt, stale, retry }),
    [status, reconnectAttempts, nextRetryAt, stale, retry],
  );
  const dataValue = useMemo(
    () => ({ prices, feed, stocks, listStatus, retryList }),
    [prices, feed, stocks, listStatus, retryList],
  );

  return (
    <StreamStatusContext.Provider value={statusValue}>
      <StreamDataContext.Provider value={dataValue}>{children}</StreamDataContext.Provider>
    </StreamStatusContext.Provider>
  );
}

export function useStreamStatus(): StreamStatusValue {
  const value = useContext(StreamStatusContext);
  if (!value) throw new Error("useStreamStatus must be used inside <StreamProvider>");
  return value;
}

export function useStreamData(): StreamDataValue {
  const value = useContext(StreamDataContext);
  if (!value) throw new Error("useStreamData must be used inside <StreamProvider>");
  return value;
}

/**
 * The symbols to stream, sorted, or null before the list has any. The array
 * keeps its identity while the set of symbols is unchanged (a list reload
 * returns new objects), so the stream is not reopened for nothing.
 */
function useSymbolsOf(stocks: ActiveStock[]): string[] | null {
  const key = stocks
    .map((s) => s.symbol)
    .sort()
    .join(",");
  return useMemo(() => (key === "" ? null : key.split(",")), [key]);
}

/** Applies live quotes to `stock`, or returns it unchanged when none is newer. */
function applyQuote(stock: ActiveStock, live: LiveQuote | undefined): ActiveStock {
  // Only a quote newer than the one already applied adds a point. Both
  // timestamps come from the server, so the browser clock is irrelevant.
  if (!live || live.timestamp <= stock.lastUpdated) return stock;
  // Day values are taken whole from the quote: across midnight its new session
  // replaces yesterday's open, high, low and volume.
  return {
    ...stock,
    name: live.name || stock.name,
    currentPrice: live.price,
    sessionId: live.sessionId,
    previousClose: live.previousClose,
    open: live.open,
    high: live.high,
    low: live.low,
    volume: live.volume,
    change: live.change,
    changePercent: live.changePercent,
    tickDirection: live.tickDirection,
    sparkline: [...stock.sparkline, live.price].slice(-SPARKLINE_POINTS),
    lastUpdated: live.timestamp,
  };
}

/**
 * The listed stocks with every newer live quote applied. A stock without a new
 * quote keeps its object identity, so memo(PriceCard) skips its card: one
 * symbol's tick re-renders one card.
 */
function useLiveStocks(listed: ActiveStock[], prices: Map<string, LiveQuote>): ActiveStock[] {
  const [stocks, setStocks] = useState<ActiveStock[]>(listed);
  const [source, setSource] = useState(listed);

  // A (re)loaded list replaces what we had, with any quotes it predates applied
  // at once. Done while rendering, not in an effect, so no render ever pairs a
  // "ready" list status with the previous (empty) stocks.
  if (source !== listed) {
    setSource(listed);
    setStocks(listed.map((stock) => applyQuote(stock, prices.get(stock.symbol))));
  }

  useEffect(() => {
    if (prices.size === 0) return;
    setStocks((prev) => {
      let changed = false;
      const next = prev.map((stock) => {
        const updated = applyQuote(stock, prices.get(stock.symbol));
        if (updated !== stock) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }, [prices]);

  return stocks;
}

/** Turns true only after `value` has been true for `delayMs`; turns false at once. */
function useDebouncedFlag(value: boolean, delayMs: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!value) {
      setFlag(false);
      return;
    }
    const timer = window.setTimeout(() => setFlag(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return flag;
}
