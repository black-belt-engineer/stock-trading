import { useEffect } from "react";
import type { ChangeEvent, JSX } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { CandleChart } from "../components/CandleChart";
import { buttonClass, panelClass } from "../components/pageStyles";
import { PillGroup } from "../components/PillGroup";
import { SymbolPicker } from "../components/SymbolPicker";
import { MAX_BARS, useCandles } from "../hooks/useCandles";
import type { CandleInterval } from "../hooks/useCandles";
import { useStreamData } from "../stream/StreamProvider";
import { localTimeZone, localTimeZoneOffset } from "../utils/format";

/** Interval pills; the id is the `?interval=` value. */
const INTERVALS: readonly { id: CandleInterval; label: string }[] = [
  { id: "1m", label: "1 min" },
  { id: "5m", label: "5 min" },
  { id: "1h", label: "1 hour" },
  { id: "1d", label: "1 day" },
];
const DEFAULT_INTERVAL = "1m";

function parseInterval(value: string | null): CandleInterval {
  return INTERVALS.find((i) => i.id === value)?.id ?? DEFAULT_INTERVAL;
}

/**
 * `/chart/:symbol?interval=5m`: the latest candles of one symbol, with the
 * open candle following the stream.
 */
export function ChartPage(): JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { stocks, listStatus, retryList } = useStreamData();

  const rawSymbol = params.symbol?.trim() || null;
  const symbol = rawSymbol?.toUpperCase() ?? null;
  const interval = parseInterval(searchParams.get("interval"));

  // Normalise `/chart/aapl` to upper case without a history entry.
  useEffect(() => {
    if (symbol === null || rawSymbol === symbol) return;
    navigate({ pathname: `/chart/${encodeURIComponent(symbol)}`, search: location.search }, { replace: true });
  }, [rawSymbol, symbol, location.search, navigate]);

  // Only symbols in the list are queried: anything else is "not found" without a request.
  const known = symbol !== null && stocks.some((s) => s.symbol === symbol);
  const candles = useCandles(listStatus === "ready" && known ? symbol : null, interval);

  const changeSymbol = (event: ChangeEvent<HTMLSelectElement>): void => {
    // A new symbol is a new page in the browser history; the interval stays.
    navigate({ pathname: `/chart/${encodeURIComponent(event.target.value)}`, search: location.search });
  };

  const changeInterval = (id: string): void => {
    const next = new URLSearchParams(searchParams);
    if (id === DEFAULT_INTERVAL) next.delete("interval");
    else next.set("interval", id);
    const search = next.toString();
    // Replaced, not pushed, like the History page's range: Back leaves the page.
    navigate({ search: search ? `?${search}` : "" }, { replace: true });
  };

  return (
    <>
      <h1 className="text-[18px] font-semibold text-primary">Chart</h1>
      <section aria-label="Chart filters" className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <SymbolPicker stocks={stocks} value={known ? symbol : null} onChange={changeSymbol} />
        <PillGroup pills={INTERVALS} value={interval} onChange={changeInterval} label="Candle interval" />
      </section>
      <ChartBody
        symbol={symbol}
        known={known}
        listStatus={listStatus}
        onRetryList={retryList}
        interval={interval}
        candles={candles}
      />
    </>
  );
}

function ChartBody({
  symbol,
  known,
  listStatus,
  onRetryList,
  interval,
  candles,
}: {
  symbol: string | null;
  known: boolean;
  listStatus: "loading" | "ready" | "error";
  onRetryList: () => void;
  interval: CandleInterval;
  candles: ReturnType<typeof useCandles>;
}): JSX.Element {
  if (symbol === null) {
    return <p className={panelClass}>Choose a symbol to see its chart.</p>;
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
  if (listStatus === "loading" || (known && candles.status === "loading")) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading chart"
        className="h-[340px] animate-skeleton rounded-[10px] bg-surface motion-reduce:animate-none md:h-[460px]"
      />
    );
  }
  if (!known || candles.status === "not-found") {
    return (
      <p role="alert" className={panelClass}>
        No symbol called <span className="font-mono text-primary">{symbol}</span>. Choose one from the list.
      </p>
    );
  }
  if (candles.status === "error") {
    return (
      <section role="alert" className={panelClass}>
        <div className="mb-2.5">Could not load the chart.</div>
        <button type="button" onClick={candles.reload} className={buttonClass}>
          Retry
        </button>
      </section>
    );
  }
  if (candles.bars.length === 0) {
    return <p className={panelClass}>No trades for {symbol} yet. Candles appear with its first trade.</p>;
  }
  const zone = `${localTimeZone()} (${localTimeZoneOffset()})`;
  return (
    <section aria-label={`${symbol} chart`} className="grid gap-3 rounded-[10px] border border-default bg-surface p-3 shadow-card md:p-4">
      <CandleChart symbol={symbol} interval={interval} bars={candles.bars} />
      <p className="text-[12px] text-secondary">
        The latest {MAX_BARS} bars at most. Bucket edges are UTC;{" "}
        {interval === "1d" ? "a daily bar is one UTC session, the same day as the dashboard's day values." : `times are shown in ${zone}.`}{" "}
        A period without trades is drawn flat at the previous close.
      </p>
    </section>
  );
}
