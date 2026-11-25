import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveStock } from "../types";

/** A live sort re-orders the grid at most this often, so cards do not move under the cursor every second. */
export const RESORT_INTERVAL_MS = 5000;

type Shown = {
  /** What the user asked for (filter, search, sort) and which symbols that gave. */
  key: string;
  order: string[];
};

/**
 * Shows `sorted` in an order that changes slowly. A change of the view itself
 * (`viewKey`: filter, search or sort) or of the set of symbols shows the new
 * order at once. A change that comes only from live values (prices moving under
 * a price sort) waits until `RESORT_INTERVAL_MS` has passed since the last
 * re-order, and never happens while `frozen` (pointer over the grid, or focus
 * inside it).
 *
 * The stocks returned are always the current objects from `sorted`: only their
 * order is held back, never their values.
 */
export function useSettledOrder(sorted: ActiveStock[], viewKey: string, frozen: boolean): ActiveStock[] {
  const liveOrder = useMemo(() => sorted.map((s) => s.symbol), [sorted]);
  const liveOrderKey = liveOrder.join(",");
  // The same symbols in any order: only a live re-order leaves this unchanged.
  const membersKey = useMemo(() => `${viewKey}|${[...liveOrder].sort().join(",")}`, [viewKey, liveOrder]);

  const [shown, setShown] = useState<Shown>({ key: membersKey, order: liveOrder });
  const lastReorderRef = useRef(0);

  // A new view or a new set of symbols: adopt the order while rendering, so no
  // frame shows the new view in the old order.
  if (shown.key !== membersKey) setShown({ key: membersKey, order: liveOrder });

  const shownKey = shown.order.join(",");

  useEffect(() => {
    lastReorderRef.current = Date.now();
  }, [membersKey]);

  useEffect(() => {
    if (frozen || shownKey === liveOrderKey) return;
    const wait = Math.max(0, lastReorderRef.current + RESORT_INTERVAL_MS - Date.now());
    const timer = window.setTimeout(() => {
      lastReorderRef.current = Date.now();
      setShown({ key: membersKey, order: liveOrderKey.split(",") });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [frozen, shownKey, liveOrderKey, membersKey]);

  return useMemo(() => {
    const bySymbol = new Map(sorted.map((s) => [s.symbol, s]));
    // While the shown order is from a previous view (the render that adopts the
    // new one), fall back to the live order.
    const order = shown.key === membersKey ? shown.order : liveOrder;
    return order.flatMap((symbol) => {
      const stock = bySymbol.get(symbol);
      return stock ? [stock] : [];
    });
  }, [sorted, shown, membersKey, liveOrder]);
}
