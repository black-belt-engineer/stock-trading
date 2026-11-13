import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Topbar } from "../components/Topbar";
import { PriceGrid } from "../components/PriceGrid";
import { DetailPanel } from "../components/DetailPanel";
import { useStreamData, useStreamStatus } from "../stream/StreamProvider";
import type { ActiveStock, ListStatus } from "../types";

const SPARKLINE_POINTS = 30;

const EMPTY_STOCK: ActiveStock = {
  symbol: "",
  name: "",
  currentPrice: 0,
  changePercent: 0,
  changeValue: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
  sparkline: [],
  lastUpdated: 0,
};

/** Marks a history entry the dashboard pushed itself, so closing the dialog can go back. */
type DialogState = { openedFromList: true } | null;

export function QuotesPage(): JSX.Element {
  const [stocks, setStocks] = useState<ActiveStock[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listAttempt, setListAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { prices } = useStreamData();
  const { status } = useStreamStatus();

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    setListStatus("loading");
    fetch("/quotes/discovery/active-stocks", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Active stocks request failed with ${response.status}`);
        return (await response.json()) as unknown;
      })
      .then((json) => {
        const parsed: Partial<ActiveStock>[] = Array.isArray(json)
          ? json
          : (json as { stocks?: ActiveStock[] })?.stocks ?? [];
        const mapped = parsed.map((item) => ({
          ...EMPTY_STOCK,
          ...item,
          symbol: item.symbol ?? "",
          sparkline: Array.isArray(item.sparkline) ? item.sparkline : [],
        }));
        setStocks(mapped);
        setListStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setListStatus("error");
      });
    return () => controller.abort();
  }, [listAttempt]);

  const retryList = useCallback(() => setListAttempt((n) => n + 1), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (prices.size === 0) return;
    setStocks((prev) => {
      let changed = false;
      const next = prev.map((stock) => {
        const live = prices.get(stock.symbol);
        // Only a quote newer than the one already applied adds a point. Both
        // timestamps come from the server, so the browser clock is irrelevant.
        // Returning the same object lets memo(PriceCard) skip untouched cards.
        if (!live || live.timestamp <= stock.lastUpdated) return stock;
        changed = true;
        return {
          ...stock,
          name: live.name || stock.name,
          currentPrice: live.price,
          changePercent: live.changePercent,
          changeValue: live.changeValue ?? stock.changeValue,
          sparkline: [...stock.sparkline, live.price].slice(-SPARKLINE_POINTS),
          lastUpdated: live.timestamp,
        };
      });
      return changed ? next : prev;
    });
  }, [prices]);

  // The open symbol lives in the URL (`/?symbol=AAPL`), so the dialog is linkable.
  const rawSymbol = searchParams.get("symbol")?.trim() || null;
  const selected = rawSymbol?.toUpperCase() ?? null;

  // Normalise `?symbol=aapl` to upper case without adding a history entry.
  useEffect(() => {
    if (rawSymbol === null || rawSymbol === selected) return;
    const next = new URLSearchParams(searchParams);
    next.set("symbol", selected!);
    navigate({ search: `?${next.toString()}` }, { replace: true, state: location.state });
  }, [rawSymbol, selected, searchParams, location.state, navigate]);

  const selectedStock = useMemo(
    () => (selected ? stocks.find((s) => s.symbol === selected) ?? null : null),
    [selected, stocks],
  );

  // `navigate` changes identity on every navigation in declarative mode. Reading
  // it through a ref keeps `openDetail` stable, so memo(PriceCard) still skips
  // cards whose stock did not change.
  const navigateRef = useRef(navigate);
  const searchRef = useRef(searchParams);
  useEffect(() => {
    navigateRef.current = navigate;
    searchRef.current = searchParams;
  }, [navigate, searchParams]);

  const openDetail = useCallback((symbol: string) => {
    const next = new URLSearchParams(searchRef.current);
    next.set("symbol", symbol);
    const state: DialogState = { openedFromList: true };
    navigateRef.current({ search: `?${next.toString()}` }, { state });
  }, []);

  const closeDetail = useCallback(() => {
    // Opened from the list: going back removes the entry, so the back button
    // and the close button agree. Opened from a link: there is no entry of ours
    // to go back to, so replace the URL instead of leaving the site.
    if ((location.state as DialogState)?.openedFromList) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("symbol");
    const search = next.toString();
    navigate({ search: search ? `?${search}` : "" }, { replace: true });
  }, [location.state, navigate, searchParams]);

  const lastUpdated = useMemo(
    () => stocks.reduce((acc, s) => Math.max(acc, s.lastUpdated ?? 0), 0) || now,
    [stocks, now],
  );

  return (
    <>
      <Topbar stocks={stocks} lastUpdate={lastUpdated} />
      <PriceGrid stocks={stocks} onOpen={openDetail} />
      <DetailPanel
        symbol={selected}
        stock={selectedStock}
        listStatus={listStatus}
        onRetryList={retryList}
        streamStatus={status}
        onOpenChange={(open) => !open && closeDetail()}
      />
    </>
  );
}
