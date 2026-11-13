import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedEvent, LiveQuote } from "../types";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "disconnected";

const BACKOFF = [500, 1000, 2000, 4000, 8000, 16000, 30000];

/** Returns null for a malformed message so one bad frame cannot throw inside a listener. */
function parseQuote(raw: unknown): LiveQuote | null {
  if (typeof raw !== "string") return null;
  let data: Partial<LiveQuote> | null;
  try {
    data = JSON.parse(raw) as Partial<LiveQuote> | null;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || typeof data.symbol !== "string" || data.symbol === "") {
    return null;
  }
  const num = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    symbol: data.symbol,
    name: typeof data.name === "string" && data.name !== "" ? data.name : data.symbol,
    price: num(data.price, 0),
    changeValue:
      typeof data.changeValue === "number" && Number.isFinite(data.changeValue)
        ? data.changeValue
        : undefined,
    changePercent: num(data.changePercent, 0),
    quantity: num(data.quantity, 0),
    side: data.side === "sell" ? "sell" : "buy",
    timestamp: num(data.timestamp, Date.now()),
  };
}

export function usePriceStream(symbols: string[]): {
  prices: Map<string, LiveQuote>;
  feed: FeedEvent[];
  status: StreamStatus;
  reconnectAttempts: number;
} {
  const [prices, setPrices] = useState<Map<string, LiveQuote>>(new Map());
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const retriesRef = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);

  const query = useMemo(() => symbols.join(","), [symbols]);

  useEffect(() => {
    let mounted = true;

    const cleanup = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };

    const connect = (): void => {
      if (!mounted) return;
      setStatus(retriesRef.current > 0 ? "reconnecting" : "connecting");
      const source = new EventSource(`/stream?symbols=${encodeURIComponent(query)}`);
      sourceRef.current = source;

      source.addEventListener("open", () => {
        retriesRef.current = 0;
        setReconnectAttempts(0);
        setStatus("live");
      });

      const applyQuote = (quote: LiveQuote): void => {
        setPrices((prev) => {
          const next = new Map(prev);
          next.set(quote.symbol, quote);
          return next;
        });
      };

      // Sent once per connection: current state, not trades. Prices only, never the feed.
      source.addEventListener("snapshot", (event) => {
        const quote = parseQuote((event as MessageEvent).data);
        if (quote) applyQuote(quote);
      });

      source.addEventListener("price", (event) => {
        const safeData = parseQuote((event as MessageEvent).data);
        if (!safeData) return;

        applyQuote(safeData);

        setFeed((prev) => {
          const next: FeedEvent = {
            ...safeData,
            id: `${safeData.symbol}-${safeData.timestamp}-${Math.random().toString(16).slice(2)}`,
          };
          return [next, ...prev].slice(0, 20);
        });
      });

      source.addEventListener("error", () => {
        source.close();
        sourceRef.current = null;
        if (!mounted) return;
        setStatus("reconnecting");
        const index = Math.min(retriesRef.current, BACKOFF.length - 1);
        const delay = BACKOFF[index]!;
        retriesRef.current += 1;
        setReconnectAttempts(retriesRef.current);
        timerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      });
    };

    connect();

    return () => {
      mounted = false;
      setStatus("disconnected");
      cleanup();
    };
  }, [query]);

  return { prices, feed, status, reconnectAttempts };
}
