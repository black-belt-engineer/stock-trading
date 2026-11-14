import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, JSX } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { buttonClass, panelClass } from "../components/pageStyles";
import { PillGroup } from "../components/PillGroup";
import { SymbolPicker } from "../components/SymbolPicker";
import { useTickHistory } from "../hooks/useTickHistory";
import type { HistoryTick, QueriedRange } from "../hooks/useTickHistory";
import { useStreamData } from "../stream/StreamProvider";
import type { FeedEvent } from "../types";
import {
  differentLocalDays,
  formatPrice,
  formatTickTime,
  formatVolume,
  localTimeZone,
  localTimeZoneOffset,
  NO_VALUE,
} from "../utils/format";

const MINUTE = 60_000;

/** Time-range presets; the id is the `?range=` value. The server allows at most 24 hours. */
const RANGES = [
  { id: "15m", label: "15 min", ms: 15 * MINUTE },
  { id: "1h", label: "1 hour", ms: 60 * MINUTE },
  { id: "4h", label: "4 hours", ms: 240 * MINUTE },
  { id: "24h", label: "24 hours", ms: 1440 * MINUTE },
];
const DEFAULT_RANGE = RANGES[0];

/** Live mode keeps at most this many streamed rows above the stored ones. */
const MAX_LIVE_ROWS = 2000;

/**
 * `/history/:symbol?range=1h`: the stored trades of one symbol, newest first,
 * a page at a time, with an optional live mode that prepends trades from the
 * stream, and a CSV export of the queried range.
 */
export function HistoryPage(): JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { stocks, listStatus, retryList, feed } = useStreamData();

  const rawSymbol = params.symbol?.trim() || null;
  const symbol = rawSymbol?.toUpperCase() ?? null;
  const range = RANGES.find((r) => r.id === searchParams.get("range")) ?? DEFAULT_RANGE;

  // Normalise `/history/aapl` to upper case without a history entry.
  useEffect(() => {
    if (symbol === null || rawSymbol === symbol) return;
    navigate({ pathname: `/history/${encodeURIComponent(symbol)}`, search: location.search }, { replace: true });
  }, [rawSymbol, symbol, location.search, navigate]);

  // Only symbols in the list are queried: anything else is "not found" without a request.
  const known = symbol !== null && stocks.some((s) => s.symbol === symbol);
  const history = useTickHistory(listStatus === "ready" && known ? symbol : null, range.ms);

  const [live, setLive] = useState(false);
  const liveTicks = useLiveTicks(feed, live && history.status === "ready" ? symbol : null, history);

  const changeSymbol = (event: ChangeEvent<HTMLSelectElement>): void => {
    // A new symbol is a new page in the browser history; the range stays.
    navigate({ pathname: `/history/${encodeURIComponent(event.target.value)}`, search: location.search });
  };

  const changeRange = (id: string): void => {
    const next = new URLSearchParams(searchParams);
    if (id === DEFAULT_RANGE.id) next.delete("range");
    else next.set("range", id);
    const search = next.toString();
    // Replaced, not pushed, like the sector filter: Back leaves the page.
    navigate({ search: search ? `?${search}` : "" }, { replace: true });
  };

  const toggleLive = (): void => {
    // Turning live on reloads first, so no trade between the old range's end and now is missing.
    if (!live) history.reload();
    setLive(!live);
  };

  return (
    <>
      <h1 className="text-[18px] font-semibold text-primary">History</h1>
      <section aria-label="History filters" className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <SymbolPicker stocks={stocks} value={known ? symbol : null} onChange={changeSymbol} />
        <PillGroup pills={RANGES} value={range.id} onChange={changeRange} label="Time range" />
        {known && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={live}
              onClick={toggleLive}
              className={buttonClass + (live ? " border-brand! bg-brand-dim text-brand" : "")}
            >
              <span
                aria-hidden="true"
                className={`mr-2 size-2 rounded-full ${live ? "animate-pulse-live bg-brand motion-reduce:animate-none" : "bg-[var(--text-muted)]"}`}
              />
              Live
            </button>
            <button type="button" onClick={history.reload} className={buttonClass}>
              Refresh
            </button>
            {history.range && symbol && <ExportLink symbol={symbol} range={history.range} />}
          </div>
        )}
      </section>
      <HistoryBody
        symbol={symbol}
        known={known}
        listStatus={listStatus}
        onRetryList={retryList}
        history={history}
        liveTicks={liveTicks}
        live={live}
      />
    </>
  );
}

/**
 * A plain link: the endpoint needs no token yet. After A2 it needs one, and
 * this becomes a fetch with the header and a download from the blob (phase 10).
 */
function ExportLink({ symbol, range }: { symbol: string; range: QueriedRange }): JSX.Element {
  const href = `/quotes/${encodeURIComponent(symbol)}/ticks.csv?${new URLSearchParams(range).toString()}`;
  return (
    <a href={href} download className={buttonClass}>
      Export CSV
    </a>
  );
}

function HistoryBody({
  symbol,
  known,
  listStatus,
  onRetryList,
  history,
  liveTicks,
  live,
}: {
  symbol: string | null;
  known: boolean;
  listStatus: "loading" | "ready" | "error";
  onRetryList: () => void;
  history: ReturnType<typeof useTickHistory>;
  liveTicks: HistoryTick[];
  live: boolean;
}): JSX.Element {
  if (symbol === null) {
    return <p className={panelClass}>Choose a symbol to see its trades.</p>;
  }
  if (listStatus === "error") {
    return (
      <section role="alert" className={panelClass}>
        <div className="mb-2.5">Could not load the list of symbols.</div>
        <button type="button" onClick={onRetryList} className={buttonClass}>
          Retry
        </button>
      </section>
    );
  }
  if (listStatus === "loading" || (known && history.status === "loading")) {
    return <TableSkeleton />;
  }
  if (!known || history.status === "not-found") {
    return (
      <p role="alert" className={panelClass}>
        No symbol called <span className="font-mono text-primary">{symbol}</span>. Choose one from the list.
      </p>
    );
  }
  if (history.status === "error" || !history.range) {
    return (
      <section role="alert" className={panelClass}>
        <div className="mb-2.5">Could not load the trade history.</div>
        <button type="button" onClick={history.reload} className={buttonClass}>
          Retry
        </button>
      </section>
    );
  }
  return <TickTable symbol={symbol} history={history} range={history.range} liveTicks={liveTicks} live={live} />;
}

function TickTable({
  symbol,
  history,
  range,
  liveTicks,
  live,
}: {
  symbol: string;
  history: ReturnType<typeof useTickHistory>;
  range: QueriedRange;
  liveTicks: HistoryTick[];
  live: boolean;
}): JSX.Element {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const rows = liveTicks.length > 0 ? [...liveTicks, ...history.ticks] : history.ticks;
  const newest = rows[0]?.time ?? to;
  const withDate = differentLocalDays(from, Math.max(newest, to));
  const offset = localTimeZoneOffset(to);

  // "Load more" disappears at the end of the range. If it was the last control
  // used and focus went with it, put focus on the end message instead of the body.
  const endRef = useRef<HTMLParagraphElement>(null);
  const usedMoreRef = useRef(false);
  useEffect(() => {
    if (history.hasMore || !usedMoreRef.current) return;
    usedMoreRef.current = false;
    if (document.activeElement === null || document.activeElement === document.body) endRef.current?.focus();
  }, [history.hasMore]);

  const loadMore = (): void => {
    usedMoreRef.current = true;
    history.loadMore();
  };

  return (
    <section aria-label={`${symbol} trades`} className="rounded-[10px] border border-default bg-surface shadow-card">
      <p className="border-b border-subtle px-3 py-2.5 text-[12px] text-secondary">
        Stored trades from {formatTickTime(from, withDate)} to {formatTickTime(to, withDate)}, newest first. Times in{" "}
        {localTimeZone()} ({offset}).
        {live && " Live: new trades are added at the top; the export covers the range above, press Refresh to extend it."}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-secondary">No trades in this range.</p>
      ) : (
        <table className="w-full border-collapse font-mono text-[12px] tabular-nums md:text-[13px]">
          <caption className="sr-only">
            {symbol} trades, newest first, {rows.length} shown
          </caption>
          <thead className="sticky top-0 bg-surface text-left text-[11px] tracking-widest text-secondary uppercase">
            <tr className="border-b border-subtle">
              <th scope="col" className="px-2 py-2 md:px-3 font-normal">
                Time <span className="normal-case">({offset})</span>
              </th>
              <th scope="col" className="px-2 py-2 md:px-3 text-right font-normal">
                Price
              </th>
              <th scope="col" className="px-2 py-2 md:px-3 text-right font-normal">
                Size
              </th>
              <th scope="col" className="px-2 py-2 md:px-3 font-normal">
                Side
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tick) => (
              <tr key={tick.id} className="border-b border-subtle last:border-b-0">
                <td className="px-2 py-1.5 md:px-3 whitespace-nowrap text-secondary">{formatTickTime(tick.time, withDate)}</td>
                <td className="px-2 py-1.5 md:px-3 text-right text-primary">{formatPrice(tick.price)}</td>
                <td className="px-2 py-1.5 md:px-3 text-right text-primary">{formatVolume(tick.size)}</td>
                <td className={`px-2 py-1.5 md:px-3 ${tick.side === "buy" ? "text-positive" : tick.side === "sell" ? "text-negative" : "text-secondary"}`}>
                  {tick.side === "buy" ? "Buy" : tick.side === "sell" ? "Sell" : NO_VALUE}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-subtle px-3 py-3 text-secondary">
        {history.hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            // Not `disabled` while loading: that would drop keyboard focus. A second click is ignored.
            aria-disabled={history.loadingMore}
            className={buttonClass}
          >
            {history.loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : (
          rows.length > 0 && (
            <p ref={endRef} tabIndex={-1} className="outline-none">
              Start of the range reached.
            </p>
          )
        )}
        <span role="status" className="text-[12px]">
          {history.loadMoreFailed ? "Could not load more trades. Try again." : `${rows.length} trades shown`}
        </span>
      </div>
    </section>
  );
}

function TableSkeleton(): JSX.Element {
  return (
    <section aria-busy="true" aria-label="Loading trades" className="grid gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-7 animate-skeleton rounded-md bg-surface motion-reduce:animate-none" />
      ))}
    </section>
  );
}

/**
 * Trades of `symbol` from the stream that are newer than every row shown, for
 * live mode. Postgres is written before the stream entry, so a streamed trade
 * no newer than the newest stored row is already in the table (or arrived out
 * of order, which the stream never carries). Resets when the query changes.
 */
function useLiveTicks(
  feed: FeedEvent[],
  symbol: string | null,
  history: ReturnType<typeof useTickHistory>,
): HistoryTick[] {
  const [rows, setRows] = useState<HistoryTick[]>([]);
  const [forRange, setForRange] = useState<QueriedRange | null>(history.range);

  // A new query (or live turned off) starts again; done while rendering so no
  // render pairs new stored rows with old live ones.
  const key = symbol === null ? null : history.range;
  if (forRange !== key) {
    setForRange(key);
    setRows([]);
  }

  const storedNewest = history.ticks[0]?.time ?? (history.range ? Date.parse(history.range.from) : 0);

  useEffect(() => {
    if (symbol === null) return;
    setRows((prev) => {
      const newest = Math.max(prev[0]?.time ?? 0, storedNewest);
      // The feed is newest first; keep this symbol's trades newer than everything shown.
      const fresh = feed
        .filter((e) => e.symbol === symbol && e.timestamp > newest)
        .map((e) => ({
          id: `live:${e.timestamp}`,
          time: e.timestamp,
          price: e.price,
          size: e.quantity,
          side: e.side,
        }));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].slice(0, MAX_LIVE_ROWS);
    });
  }, [feed, symbol, storedNewest]);

  return symbol === null ? [] : rows;
}
