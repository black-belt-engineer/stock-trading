import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedEvent, LiveQuote } from "../types";

type StreamStatus = "connecting" | "live" | "reconnecting" | "disconnected";

const BACKOFF = [500, 1000, 2000, 4000, 8000, 16000, 30000];

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

      source.addEventListener("price", (event) => {
        const data = JSON.parse(event.data) as LiveQuote;
        const safeData: LiveQuote = {
          symbol: data.symbol,
          name: data.name ?? data.symbol,
          price: Number.isFinite(data.price) ? data.price : 0,
          changePercent: Number.isFinite(data.changePercent) ? data.changePercent : 0,
          quantity: Number.isFinite(data.quantity) ? data.quantity : 0,
          side: data.side === "sell" ? "sell" : "buy",
          timestamp: Number.isFinite(data.timestamp) ? data.timestamp : Date.now(),
        };

        setPrices((prev) => {
          const next = new Map(prev);
          next.set(safeData.symbol, safeData);
          return next;
        });

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
