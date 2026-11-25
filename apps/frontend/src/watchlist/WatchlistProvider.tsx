import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { JSX, ReactNode } from "react";
import { createWatchlistApi } from "./watchlistApi";
import type { WatchlistApi } from "./watchlistApi";
import { WatchlistStore } from "./watchlistStore";
import type { WatchlistSnapshot } from "./watchlistStore";

export type WatchlistContextValue = WatchlistSnapshot & {
  toggle: (symbol: string) => void;
  remove: (symbol: string) => void;
  move: (symbol: string, delta: number) => void;
  retry: () => void;
  dismissNotice: () => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

/**
 * The user's watchlist (P1), for every page behind login. Mounted by the route guard next to
 * the stream, so it exists only with a session and a logout drops it.
 *
 * Another tab or device is not told about a change: the list is reloaded whenever this window
 * gets focus or becomes visible again.
 */
export function WatchlistProvider({ children, api }: { children: ReactNode; api?: WatchlistApi }): JSX.Element {
  const [store] = useState(() => new WatchlistStore(api ?? createWatchlistApi()));

  useEffect(() => {
    void store.load();
    const reload = (): void => {
      if (document.visibilityState === "visible") void store.load();
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [store]);

  // No dispose on unmount: StrictMode runs effects twice in development, and an answer that
  // arrives after a logout only updates a store nobody subscribes to any more.

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const value = useMemo<WatchlistContextValue>(
    () => ({
      ...snapshot,
      toggle: (symbol) => store.toggle(symbol),
      remove: (symbol) => store.remove(symbol),
      move: (symbol, delta) => store.move(symbol, delta),
      retry: () => void store.load(),
      dismissNotice: () => store.dismissNotice(),
    }),
    [snapshot, store],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const value = useContext(WatchlistContext);
  if (value === null) throw new Error("useWatchlist needs a WatchlistProvider");
  return value;
}
