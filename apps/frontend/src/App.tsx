import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { FilterPills } from "./components/FilterPills";
import { PriceGrid } from "./components/PriceGrid";
import { LiveFeed } from "./components/LiveFeed";
import { DetailPanel } from "./components/DetailPanel";
import { usePriceStream } from "./hooks/usePriceStream";
import type { ActiveStock } from "./types";

const SYMBOLS = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"];

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

export default function App(): JSX.Element {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [stocks, setStocks] = useState<ActiveStock[]>([]);
  const [now, setNow] = useState(Date.now());
  const { prices, feed, status, reconnectAttempts } = usePriceStream(SYMBOLS);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void fetch("/quotes/discovery/active-stocks")
      .then((r) => (r.ok ? r.json() : []))
      .then((json: unknown) => {
        const parsed = Array.isArray(json)
          ? json
          : (json as { stocks?: ActiveStock[] })?.stocks ?? [];
        const mapped = parsed.map((item) => ({
          ...EMPTY_STOCK,
          ...item,
          symbol: item.symbol ?? "",
          sparkline: Array.isArray(item.sparkline) ? item.sparkline : [],
        }));
        setStocks(mapped);
      })
      .catch(() => setStocks([]));
  }, []);

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

  const selectedStock = useMemo(
    () => (selected ? stocks.find((s) => s.symbol === selected) ?? null : null),
    [selected, stocks],
  );

  // The symbol left the list while its dialog was open: close it.
  useEffect(() => {
    if (selected && !selectedStock) setSelected(null);
  }, [selected, selectedStock]);

  const openDetail = useCallback((symbol: string) => setSelected(symbol), []);

  const filtered = useMemo(() => {
    if (filter === "all") return stocks;
    if (filter === "tech") return stocks.filter((s) => SYMBOLS.includes(s.symbol));
    return stocks;
  }, [filter, stocks]);

  const lastUpdated = useMemo(
    () => filtered.reduce((acc, s) => Math.max(acc, s.lastUpdated ?? 0), 0) || now,
    [filtered, now],
  );

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr_300px] bg-base">
      <Sidebar status={status} attempts={reconnectAttempts} />
      <main className="flex flex-col gap-3.5 overflow-y-auto px-5 py-[18px]">
        <Topbar stocks={filtered} lastUpdate={lastUpdated} />
        <FilterPills value={filter} onChange={setFilter} />
        <PriceGrid stocks={filtered} onOpen={openDetail} />
      </main>
      <LiveFeed feed={feed} />
      <DetailPanel
        stock={selectedStock}
        streamStatus={status}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
