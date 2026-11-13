import { createContext, useContext, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { usePriceStream } from "../hooks/usePriceStream";
import type { StreamStatus } from "../hooks/usePriceStream";
import type { FeedEvent, LiveQuote } from "../types";

/** The symbols the dashboard streams. M1 replaces this with the symbol registry. */
export const SYMBOLS = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];

type StreamStatusValue = {
  status: StreamStatus;
  reconnectAttempts: number;
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
  const { prices, feed, status, reconnectAttempts } = usePriceStream(SYMBOLS);

  const statusValue = useMemo(() => ({ status, reconnectAttempts }), [status, reconnectAttempts]);
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
