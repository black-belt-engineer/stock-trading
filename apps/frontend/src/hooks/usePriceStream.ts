import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedEvent, LiveQuote } from "../types";
import { finiteOrNull, isRecord } from "../utils/guards";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "disconnected";

const BACKOFF = [500, 1000, 2000, 4000, 8000, 16000];
/** The wait once BACKOFF is used up. */
const MAX_BACKOFF_MS = 30000;

/**
 * Temporary until S1 adds a server heartbeat: a connection that has delivered
 * nothing for this long is treated as dead (a laptop waking from sleep often
 * gets no `error` event). When the ingestor alone is down this reconnects
 * every 15 s; the snapshot on each new connection keeps it from looping faster.
 */
const SILENCE_LIMIT_MS = 15_000;

/** Returns null for a malformed message so one bad frame cannot throw inside a listener. */
function parseQuote(raw: unknown): LiveQuote | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.symbol !== "string" || data.symbol === "") {
    return null;
  }
  return {
    symbol: data.symbol,
    name: typeof data.name === "string" && data.name !== "" ? data.name : data.symbol,
    price: finiteOrNull(data.price) ?? 0,
    changeValue: finiteOrNull(data.changeValue) ?? undefined,
    changePercent: finiteOrNull(data.changePercent) ?? 0,
    quantity: finiteOrNull(data.quantity) ?? 0,
    side: data.side === "sell" ? "sell" : "buy",
    timestamp: finiteOrNull(data.timestamp) ?? Date.now(),
  };
}

/** Opens no connection while `symbols` is null or empty. */
export function usePriceStream(symbols: string[] | null): {
  prices: Map<string, LiveQuote>;
  feed: FeedEvent[];
  status: StreamStatus;
  reconnectAttempts: number;
  /** When the next reconnect attempt is scheduled (epoch ms), or null when none is pending. */
  nextRetryAt: number | null;
  /** Skips the remaining backoff and reconnects now. */
  retry: () => void;
} {
  const [prices, setPrices] = useState<Map<string, LiveQuote>>(new Map());
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const retriesRef = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastMessageRef = useRef(0);
  /** Set by the effect below; reconnects immediately. A no-op before mount and after unmount. */
  const retryRef = useRef<() => void>(() => {});

  const query = useMemo(() => symbols?.join(",") ?? "", [symbols]);

  useEffect(() => {
    if (query === "") return;
    let mounted = true;

    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setNextRetryAt(null);
    };

    const closeSource = (): void => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };

    const scheduleReconnect = (): void => {
      closeSource();
      if (!mounted) return;
      setStatus("reconnecting");
      const delay = BACKOFF[retriesRef.current] ?? MAX_BACKOFF_MS;
      retriesRef.current += 1;
      setReconnectAttempts(retriesRef.current);
      setNextRetryAt(Date.now() + delay);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setNextRetryAt(null);
        connect();
      }, delay);
    };

    const connect = (): void => {
      if (!mounted) return;
      setStatus(retriesRef.current > 0 ? "reconnecting" : "connecting");
      const source = new EventSource(`/stream?symbols=${encodeURIComponent(query)}`);
      sourceRef.current = source;
      lastMessageRef.current = Date.now();

      source.addEventListener("open", () => {
        retriesRef.current = 0;
        lastMessageRef.current = Date.now();
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
        lastMessageRef.current = Date.now();
        const quote = parseQuote(event.data);
        if (quote) applyQuote(quote);
      });

      source.addEventListener("price", (event) => {
        lastMessageRef.current = Date.now();
        const safeData = parseQuote(event.data);
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
        // Only the current connection may schedule a reconnect.
        if (sourceRef.current !== source) return;
        scheduleReconnect();
      });
    };

    const retryNow = (): void => {
      if (!mounted) return;
      clearTimer();
      closeSource();
      connect();
    };
    retryRef.current = retryNow;

    // Back online: no point waiting out the backoff.
    const onOnline = (): void => {
      if (sourceRef.current?.readyState !== EventSource.OPEN) retryNow();
    };

    const checkSilence = (): void => {
      const source = sourceRef.current;
      if (!source || source.readyState !== EventSource.OPEN) return;
      if (Date.now() - lastMessageRef.current > SILENCE_LIMIT_MS) scheduleReconnect();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") checkSilence();
    };
    const watchdog = window.setInterval(checkSilence, 1000);

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    connect();

    return () => {
      mounted = false;
      retryRef.current = () => {};
      window.clearInterval(watchdog);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      setStatus("disconnected");
      clearTimer();
      closeSource();
    };
  }, [query]);

  const retry = useCallback(() => retryRef.current(), []);

  return { prices, feed, status, reconnectAttempts, nextRetryAt, retry };
}
