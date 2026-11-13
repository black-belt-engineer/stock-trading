import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { usePriceStream } from "../hooks/usePriceStream";
import type { StreamStatus } from "../hooks/usePriceStream";
import type { FeedEvent, LiveQuote } from "../types";

/** The symbols the dashboard streams. M1 replaces this with the symbol registry. */
export const SYMBOLS = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];

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
};

/*
 * Two contexts so that components which only show the connection state (the
 * sidebar) do not re-render on every tick, which the data context does.
 */
const StreamStatusContext = createContext<StreamStatusValue | null>(null);
const StreamDataContext = createContext<StreamDataValue | null>(null);

/**
 * Owns the one SSE connection for the whole app. It sits above the routes, so
 * navigating between pages does not close and reopen the stream.
 */
export function StreamProvider({ children }: { children: ReactNode }): JSX.Element {
  const { prices, feed, status, reconnectAttempts, nextRetryAt, retry } = usePriceStream(SYMBOLS);
  const stale = useDebouncedFlag(status !== "live", STALE_AFTER_MS);

  const statusValue = useMemo(
    () => ({ status, reconnectAttempts, nextRetryAt, stale, retry }),
    [status, reconnectAttempts, nextRetryAt, stale, retry],
  );
  const dataValue = useMemo(() => ({ prices, feed }), [prices, feed]);

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
