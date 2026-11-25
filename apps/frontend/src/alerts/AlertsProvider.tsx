import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { JSX, ReactNode } from "react";
import { useStreamData } from "../stream/StreamProvider";
import { createAlertsApi } from "./alertsApi";
import type { AlertsApi, CreateResult, NewAlert } from "./alertsApi";
import { AlertsStore } from "./alertsStore";
import type { AlertsSnapshot } from "./alertsStore";
import { notifyInBackground } from "./browserNotifications";

export type AlertsContextValue = AlertsSnapshot & {
  create: (alert: NewAlert) => Promise<CreateResult>;
  remove: (id: string) => void;
  retry: () => void;
  dismissToast: (id: string) => void;
  dismissNotice: () => void;
  markSeen: () => void;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);

/** When the bell was last opened, shared by the tabs of this browser. */
const SEEN_KEY = "streamtick.alerts.seenAt";

const seenStore = {
  read: (): number => {
    try {
      const value = Number(window.localStorage.getItem(SEEN_KEY));
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  },
  write: (at: number): void => {
    try {
      window.localStorage.setItem(SEEN_KEY, String(at));
    } catch {
      // Storage blocked: the count resets on reload, nothing else breaks.
    }
  },
};

/**
 * The user's price alerts (P2), checked in this tab against every stream update, the
 * connection's snapshot included (Q7). Mounted by the route guard inside the stream provider,
 * so alerts exist only with a session.
 *
 * Other tabs and devices are not told about changes: the list is reloaded on focus and when the
 * tab becomes visible, like the watchlist. Exactly-once notification does not depend on that;
 * the server's trigger decides it.
 */
export function AlertsProvider({ children, api }: { children: ReactNode; api?: AlertsApi }): JSX.Element {
  const [store] = useState(() => new AlertsStore(api ?? createAlertsApi(), { onFired: notifyInBackground, seenStore }));

  useEffect(() => {
    void store.load();
    const reload = (): void => {
      if (document.visibilityState === "visible") void store.load();
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === SEEN_KEY) store.syncSeen(seenStore.read());
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const value = useMemo<AlertsContextValue>(
    () => ({
      ...snapshot,
      create: (alert) => store.create(alert),
      remove: (id) => void store.remove(id),
      retry: () => void store.load(),
      dismissToast: (id) => store.dismissToast(id),
      dismissNotice: () => store.dismissNotice(),
      markSeen: () => store.markSeen(),
    }),
    [snapshot, store],
  );

  return (
    <AlertsContext.Provider value={value}>
      {children}
      <AlertEvaluator store={store} />
    </AlertsContext.Provider>
  );
}

/**
 * Re-renders on every tick (it reads the stream's data context), so the provider and its
 * children do not: it only hands the latest prices to the store.
 */
function AlertEvaluator({ store }: { store: AlertsStore }): null {
  const { prices } = useStreamData();
  const { active } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    store.evaluate(prices);
  }, [store, prices, active]);
  return null;
}

export function useAlerts(): AlertsContextValue {
  const value = useContext(AlertsContext);
  if (value === null) throw new Error("useAlerts needs an AlertsProvider");
  return value;
}
