import { useEffect, useMemo, useRef, useState } from "react";
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
      const next = prev.map((stock) => {
        const live = prices.get(stock.symbol);
        if (!live) return stock;
        const nextSparkline = [...stock.sparkline, live.price].slice(-30);
        return {
          ...stock,
          name: live.name || stock.name,
          currentPrice: live.price ?? 0,
          changePercent: live.changePercent ?? 0,
          changeValue: ((live.changePercent ?? 0) / 100) * (live.price ?? 0),
          sparkline: nextSparkline,
          lastUpdated: live.timestamp ?? Date.now(),
        };
      });
      return next;
    });
  }, [prices]);

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
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", minHeight: "100vh", background: "var(--bg-base)" }}>
      <Sidebar status={status} attempts={reconnectAttempts} />
      <main style={{ padding: "18px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <Topbar stocks={filtered} lastUpdate={lastUpdated} />
        <FilterPills value={filter} onChange={setFilter} />
        <PriceGrid stocks={filtered} onOpen={(symbol) => setSelected(symbol)} />
      </main>
      <LiveFeed feed={feed} />
      <DetailPanel symbol={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
