import { useCallback, useEffect, useState } from "react";
import type { ActiveStock, ListStatus } from "../types";

/** A number from the server, or null for anything else (missing, null, NaN). */
function priceOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Turns one entry of the discovery response into an `ActiveStock`, or null when it has no symbol. */
function parseStock(raw: unknown): ActiveStock | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.symbol !== "string" || item.symbol === "") return null;
  return {
    symbol: item.symbol,
    name: text(item.name, item.symbol),
    sector: text(item.sector, "Other"),
    exchange: text(item.exchange, ""),
    currentPrice: priceOrNull(item.currentPrice),
    changePercent: priceOrNull(item.changePercent),
    changeValue: priceOrNull(item.changeValue),
    high24h: priceOrNull(item.high24h),
    low24h: priceOrNull(item.low24h),
    volume24h: priceOrNull(item.volume24h),
    sparkline: Array.isArray(item.sparkline)
      ? item.sparkline.filter((p): p is number => typeof p === "number" && Number.isFinite(p))
      : [],
    lastUpdated: priceOrNull(item.lastUpdated) ?? 0,
  };
}

/**
 * Fetches the symbols the dashboard shows, with their prices as of the request.
 * On a retry the previous list is kept until the new one arrives, so an open
 * stream is not closed by the reload.
 */
export function useSymbolList(): { stocks: ActiveStock[]; status: ListStatus; retry: () => void } {
  const [stocks, setStocks] = useState<ActiveStock[]>([]);
  const [status, setStatus] = useState<ListStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/quotes/discovery/active-stocks", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Active stocks request failed with ${response.status}`);
        return (await response.json()) as unknown;
      })
      .then((json) => {
        const list: unknown[] = Array.isArray(json)
          ? json
          : Array.isArray((json as { stocks?: unknown })?.stocks)
            ? (json as { stocks: unknown[] }).stocks
            : [];
        setStocks(list.map(parseStock).filter((s): s is ActiveStock => s !== null));
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { stocks, status, retry };
}
