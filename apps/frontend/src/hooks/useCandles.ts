import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStreamData, useStreamStatus } from "../stream/StreamProvider";
import type { FeedEvent } from "../types";
import { finiteOrNull, isRecord, textOrNull } from "../utils/guards";

export type CandleInterval = "1m" | "5m" | "1h" | "1d";

/** One OHLCV bar, as `GET /quotes/:symbol/candles` returns it. Times are epoch ms. */
export type Candle = {
  /** Bucket start, inclusive. */
  timestamp: number;
  /** Bucket end, exclusive. */
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** `false` while the bucket is open. */
  complete: boolean;
};

export type CandlesStatus = "loading" | "ready" | "error" | "not-found";

export type CandleSeries = {
  status: CandlesStatus;
  /** Oldest first, at most `MAX_BARS`. The last one moves with the stream. */
  bars: Candle[];
  reload: () => void;
};

/** The chart's fixed window: the latest 120 bars (decided by the owner, M4). The server's default window is the same. */
export const MAX_BARS = 120;
/** How long after a bucket ends its closed bar is fetched: the consumer writes Postgres a moment after the trade. */
const CLOSE_GRACE_MS = 1500;
/** A failed refetch of the latest bars is tried again after this long. */
const RETRY_MS = 5000;
/** Streamed trades kept for the open bar; far more than arrive between two refetches. */
const MAX_PENDING = 5000;

type Response = { from: number; bars: Candle[]; lastTradeAt: number | null };

/** A trade from the stream, as the chart needs it. */
type Trade = { time: number; price: number; size: number };

function parseCandle(item: unknown): Candle | null {
  if (!isRecord(item) || typeof item.complete !== "boolean") return null;
  const timestamp = finiteOrNull(item.timestamp);
  const end = finiteOrNull(item.end);
  const open = finiteOrNull(item.open);
  const high = finiteOrNull(item.high);
  const low = finiteOrNull(item.low);
  const close = finiteOrNull(item.close);
  const volume = finiteOrNull(item.volume);
  if (
    timestamp === null ||
    end === null ||
    end <= timestamp ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null
  ) {
    return null;
  }
  return { timestamp, end, open, high, low, close, volume, complete: item.complete };
}

function parseResponse(json: unknown): Response | null {
  if (!isRecord(json) || !Array.isArray(json.bars)) return null;
  const from = Date.parse(textOrNull(json.from) ?? "");
  if (!Number.isFinite(from)) return null;
  const lastTradeText = textOrNull(json.lastTradeAt);
  const lastTradeAt = lastTradeText === null ? null : Date.parse(lastTradeText);
  if (lastTradeAt !== null && !Number.isFinite(lastTradeAt)) return null;
  return {
    from,
    bars: json.bars.map(parseCandle).filter((b): b is Candle => b !== null),
    lastTradeAt,
  };
}

class NotFound extends Error {}

async function fetchCandles(
  symbol: string,
  interval: CandleInterval,
  from: number | null,
  signal: AbortSignal,
): Promise<Response> {
  const params = new URLSearchParams({ interval });
  if (from !== null) params.set("from", new Date(from).toISOString());
  const response = await fetch(`/quotes/${encodeURIComponent(symbol)}/candles?${params.toString()}`, { signal });
  if (response.status === 404) throw new NotFound();
  if (!response.ok) throw new Error(`Candle request failed with ${response.status}`);
  const parsed = parseResponse(await response.json());
  if (!parsed) throw new Error("Malformed candle response");
  return parsed;
}

/**
 * Adds streamed trades (oldest first) to the bars. A trade inside the last bar
 * updates it; one past its end opens a provisional bar of the same width,
 * which the next refetch replaces with the server's (it knows the calendar).
 * A server bar with volume 0 is a filled empty bucket (flat at the previous
 * close), so its first trade sets all four prices, as the server would.
 */
function applyTrades(bars: Candle[], trades: Trade[]): Candle[] {
  if (trades.length === 0) return bars;
  const out = bars.slice();
  for (const t of trades) {
    const last = out.at(-1);
    // Without a bar there are no bucket edges to put the trade in; a refetch adds it.
    if (!last || t.time < last.timestamp) continue;
    if (t.time < last.end) {
      const filled = last.volume === 0;
      out[out.length - 1] = {
        ...last,
        open: filled ? t.price : last.open,
        high: filled ? t.price : Math.max(last.high, t.price),
        low: filled ? t.price : Math.min(last.low, t.price),
        close: t.price,
        volume: last.volume + t.size,
      };
    } else {
      const width = last.end - last.timestamp;
      const start = last.end + Math.floor((t.time - last.end) / width) * width;
      out.push({ timestamp: start, end: start + width, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.size, complete: false });
    }
  }
  return out.slice(-MAX_BARS);
}

/**
 * The latest `MAX_BARS` candles of `symbol`, with the open bar kept up to date
 * from the stream. Shortly after the open bucket ends, and after the stream
 * reconnects, the latest bars are fetched again and replace the ones built in
 * the browser, which can differ (trades missed during a reconnect).
 *
 * No trade is counted twice: the server says which is the newest trade its
 * bars include (`lastTradeAt`) and only newer streamed trades are added.
 */
export function useCandles(symbol: string | null, interval: CandleInterval): CandleSeries {
  const { feed } = useStreamData();
  const { status: streamStatus } = useStreamStatus();

  const [status, setStatus] = useState<CandlesStatus>("loading");
  const [serverBars, setServerBars] = useState<Candle[]>([]);
  /** Streamed trades newer than everything the server bars include, oldest first. */
  const [pending, setPending] = useState<Trade[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [retryTail, setRetryTail] = useState(0);

  /** Newest trade time already in the server bars or in `pending`; older feed events are skipped. */
  const seenUpToRef = useRef(Number.POSITIVE_INFINITY);
  const tailRef = useRef<AbortController | null>(null);
  // Current values for callbacks that must not change identity on every tick.
  const serverBarsRef = useRef(serverBars);
  serverBarsRef.current = serverBars;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  // Full load: on a new symbol or interval, or `reload`.
  useEffect(() => {
    tailRef.current?.abort();
    setServerBars([]);
    setPending([]);
    // Until the first response nothing is skipped: the response decides.
    seenUpToRef.current = Number.NEGATIVE_INFINITY;
    if (symbol === null) return;
    setStatus("loading");
    const controller = new AbortController();
    fetchCandles(symbol, interval, null, controller.signal)
      .then((res) => {
        const covered = res.lastTradeAt ?? res.from - 1;
        setServerBars(res.bars.slice(-MAX_BARS));
        setPending((prev) => prev.filter((t) => t.time > covered));
        seenUpToRef.current = Math.max(seenUpToRef.current, covered);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof NotFound ? "not-found" : "error");
      });
    return () => controller.abort();
  }, [symbol, interval, attempt]);

  useEffect(() => () => tailRef.current?.abort(), []);

  /**
   * Fetches the bars from `barsBack` bars before the newest server bar onward
   * (and from any older bucket a pending trade is in) and puts them in place
   * of the ones held.
   */
  const refetchTail = useCallback(
    (barsBack: number) => {
      const held = serverBarsRef.current;
      const anchor = held.at(-1 - barsBack) ?? held[0];
      if (symbol === null || !anchor) return;
      const earliestPending = pendingRef.current[0]?.time ?? Number.POSITIVE_INFINITY;
      // The newest held bar a pending trade falls in, so no pending trade is left before `from`.
      let pendingStart = Number.POSITIVE_INFINITY;
      for (const bar of held) if (bar.timestamp <= earliestPending) pendingStart = bar.timestamp;
      const from = Math.min(anchor.timestamp, pendingStart);

      tailRef.current?.abort();
      const controller = new AbortController();
      tailRef.current = controller;
      fetchCandles(symbol, interval, from, controller.signal)
        .then((res) => {
          const covered = res.lastTradeAt ?? res.from - 1;
          setServerBars((prev) => [...prev.filter((b) => b.timestamp < res.from), ...res.bars].slice(-MAX_BARS));
          setPending((prev) => prev.filter((t) => t.time > covered));
          seenUpToRef.current = Math.max(seenUpToRef.current, covered);
          // The server can still call the bucket open when its clock is behind
          // this one; the timer would not fire again for the same end, so retry.
          const last = res.bars.at(-1);
          setRetryTail(last && !last.complete && last.end <= Date.now() ? (n) => n + 1 : 0);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setRetryTail((n) => n + 1);
        });
    },
    [symbol, interval],
  );

  // Collect this symbol's trades from the feed (newest first, a few seconds
  // long) before they scroll out of it.
  useEffect(() => {
    if (symbol === null) return;
    const seenUpTo = seenUpToRef.current;
    const fresh = feed
      .filter((e: FeedEvent) => e.symbol === symbol && e.timestamp > seenUpTo)
      .map((e) => ({ time: e.timestamp, price: e.price, size: e.quantity }))
      .reverse();
    const newest = fresh.at(-1);
    if (!newest) return;
    seenUpToRef.current = newest.time;
    setPending((prev) => [...prev, ...fresh].slice(-MAX_PENDING));
  }, [feed, symbol]);

  // When the newest server bar's bucket ends, fetch it (now complete) and the
  // bar after it. A failed attempt is tried again a little later.
  const lastServer = serverBars.at(-1);
  const lastEnd = lastServer && !lastServer.complete ? lastServer.end : null;
  useEffect(() => {
    if (lastEnd === null) return;
    const delay = retryTail > 0 ? RETRY_MS : Math.max(0, lastEnd - Date.now()) + CLOSE_GRACE_MS;
    const timer = setTimeout(() => refetchTail(0), delay);
    return () => clearTimeout(timer);
  }, [lastEnd, retryTail, refetchTail]);

  // After a reconnect the stream may have missed trades: refetch the last two bars.
  // The first connect is not a reconnect: only a drop after being live counts.
  const wasLiveRef = useRef(false);
  const droppedRef = useRef(false);
  useEffect(() => {
    const live = streamStatus === "live";
    if (!live && wasLiveRef.current) droppedRef.current = true;
    if (live && droppedRef.current && status === "ready") {
      droppedRef.current = false;
      refetchTail(1);
    }
    wasLiveRef.current = live;
  }, [streamStatus, status, refetchTail]);

  const bars = useMemo(() => applyTrades(serverBars, pending), [serverBars, pending]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { status: symbol === null ? "loading" : status, bars, reload };
}
