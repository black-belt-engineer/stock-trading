import { useCallback, useEffect, useState } from "react";
import type { ActiveStock, ListStatus } from "../types";
import { finiteOrNull, isRecord } from "../utils/guards";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Turns one entry of the discovery response into an `ActiveStock`, or null when it has no symbol. */
function parseStock(item: unknown): ActiveStock | null {
  if (!isRecord(item)) return null;
  if (typeof item.symbol !== "string" || item.symbol === "") return null;
  return {
    symbol: item.symbol,
    name: text(item.name, item.symbol),
    sector: text(item.sector, "Other"),
    exchange: text(item.exchange, ""),
    currentPrice: finiteOrNull(item.currentPrice),
    changePercent: finiteOrNull(item.changePercent),
    changeValue: finiteOrNull(item.changeValue),
    high24h: finiteOrNull(item.high24h),
    low24h: finiteOrNull(item.low24h),
    volume24h: finiteOrNull(item.volume24h),
    sparkline: Array.isArray(item.sparkline)
      ? item.sparkline.filter((p): p is number => typeof p === "number" && Number.isFinite(p))
      : [],
    lastUpdated: finiteOrNull(item.lastUpdated) ?? 0,
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
      .then(async (response): Promise<unknown> => {
        if (!response.ok) throw new Error(`Active stocks request failed with ${response.status}`);
        return response.json();
      })
      .then((json) => {
        // `{ stocks: [...] }` today; a bare array is accepted too.
        const list: unknown[] = Array.isArray(json)
          ? json
          : isRecord(json) && Array.isArray(json.stocks)
            ? json.stocks
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
