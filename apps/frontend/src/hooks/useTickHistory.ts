import { useCallback, useEffect, useRef, useState } from "react";
import { finiteOrNull, isRecord, textOrNull } from "../utils/guards";

/** One stored trade, as `GET /quotes/:symbol/ticks` returns it. */
export type HistoryTick = {
  /** Unique per row. */
  id: string;
  /** Epoch ms. */
  time: number;
  price: number | null;
  size: number | null;
  side: "buy" | "sell" | null;
};

/** The range the server actually queried; later pages and the export reuse it unchanged. */
export type QueriedRange = { from: string; to: string };

export type HistoryStatus = "loading" | "ready" | "error" | "not-found";

export type TickHistory = {
  status: HistoryStatus;
  /** Newest first. */
  ticks: HistoryTick[];
  range: QueriedRange | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  loadMore: () => void;
  /** Runs the query again with the range ending now. */
  reload: () => void;
};

const PAGE_LIMIT = 500;

type Page = { range: QueriedRange; ticks: HistoryTick[]; nextCursor: string | null };

function parseTick(item: unknown): HistoryTick | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.time !== "string") return null;
  const time = Date.parse(item.time);
  if (!Number.isFinite(time)) return null;
  return {
    id: item.id,
    time,
    price: finiteOrNull(item.price),
    size: finiteOrNull(item.size),
    side: item.side === "buy" || item.side === "sell" ? item.side : null,
  };
}

function parsePage(json: unknown): Page | null {
  if (!isRecord(json) || !Array.isArray(json.ticks)) return null;
  const from = textOrNull(json.from);
  const to = textOrNull(json.to);
  if (from === null || to === null) return null;
  return {
    range: { from, to },
    ticks: json.ticks.map(parseTick).filter((t): t is HistoryTick => t !== null),
    nextCursor: textOrNull(json.nextCursor),
  };
}

class NotFound extends Error {}

async function fetchPage(
  symbol: string,
  range: QueriedRange,
  cursor: string | null,
  signal: AbortSignal,
): Promise<Page> {
  const params = new URLSearchParams({ from: range.from, to: range.to, limit: String(PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/quotes/${encodeURIComponent(symbol)}/ticks?${params.toString()}`, { signal });
  if (response.status === 404) throw new NotFound();
  if (!response.ok) throw new Error(`Tick history request failed with ${response.status}`);
  const page = parsePage(await response.json());
  if (!page) throw new Error("Malformed tick history response");
  return page;
}

/**
 * The stored ticks of `symbol` over the last `rangeMs`, newest first, a page
 * at a time. The range is fixed when the query starts: "Load more" pages
 * backwards through that same range (keyset pagination on the server), so
 * ticks arriving meanwhile never shift it. New ticks appear on `reload`.
 */
export function useTickHistory(symbol: string | null, rangeMs: number): TickHistory {
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [ticks, setTicks] = useState<HistoryTick[]>([]);
  const [range, setRange] = useState<QueriedRange | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Aborts an in-flight "Load more" when the query changes or the page unmounts.
  const moreRef = useRef<AbortController | null>(null);

  useEffect(() => {
    moreRef.current?.abort();
    setTicks([]);
    setRange(null);
    setCursor(null);
    setLoadingMore(false);
    setLoadMoreFailed(false);
    if (symbol === null) return;
    setStatus("loading");
    const controller = new AbortController();
    const now = Date.now();
    const requested = { from: new Date(now - rangeMs).toISOString(), to: new Date(now).toISOString() };
    fetchPage(symbol, requested, null, controller.signal)
      .then((page) => {
        setTicks(page.ticks);
        setRange(page.range);
        setCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof NotFound ? "not-found" : "error");
      });
    return () => controller.abort();
  }, [symbol, rangeMs, attempt]);

  useEffect(() => () => moreRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (symbol === null || range === null || cursor === null || loadingMore) return;
    const controller = new AbortController();
    moreRef.current = controller;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    fetchPage(symbol, range, cursor, controller.signal)
      .then((page) => {
        setTicks((prev) => [...prev, ...page.ticks]);
        setCursor(page.nextCursor);
        setLoadingMore(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadingMore(false);
        setLoadMoreFailed(true);
      });
  }, [symbol, range, cursor, loadingMore]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, ticks, range, hasMore: cursor !== null, loadingMore, loadMoreFailed, loadMore, reload };
}
