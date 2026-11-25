import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { LoggedOutError } from "../api";
import { createPortfolioApi } from "./portfolioApi";
import type { Account, OrderRequest, OrderResult, PortfolioApi } from "./portfolioApi";

export type AccountStatus = "loading" | "ready" | "error";

export type PortfolioContextValue = {
  status: AccountStatus;
  /** The last account loaded; kept while a reload fails, so the page does not go blank. */
  account: Account | null;
  /** True when the last load failed (with or without an older account still shown). */
  loadFailed: boolean;
  reload: () => void;
  /** Sends the order, retrying once on no answer with the same id; reloads the account after a fill. */
  placeOrder: (order: OrderRequest) => Promise<OrderResult>;
  /** Throws when the reset failed. */
  reset: () => Promise<void>;
  /** Changes whenever an order fills or the portfolio resets: the order history reloads on it. */
  revision: number;
  api: PortfolioApi;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

/**
 * The user's paper-trading account (P3): cash, positions and this session's trades, shared by the
 * quote dialog's trade ticket and the Portfolio page. Mounted by the route guard like the
 * watchlist and alerts. Other tabs are not told about orders: the account reloads on focus and
 * when the tab becomes visible.
 */
export function PortfolioProvider({ children, api: given }: { children: ReactNode; api?: PortfolioApi }): JSX.Element {
  const [api] = useState(() => given ?? createPortfolioApi());
  const [account, setAccount] = useState<Account | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  // Only the answer to the newest request is used: one started before an order filled must not
  // put the old cash back after the newer one arrived.
  const latest = useRef(0);

  const reload = useCallback(() => {
    const request = ++latest.current;
    api.loadAccount().then(
      (next) => {
        if (request !== latest.current) return;
        setAccount(next);
        setLoadFailed(false);
      },
      (error: unknown) => {
        if (request !== latest.current || error instanceof LoggedOutError) return;
        setLoadFailed(true);
      },
    );
  }, [api]);

  useEffect(() => {
    reload();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const placeOrder = useCallback(
    async (order: OrderRequest): Promise<OrderResult> => {
      let result = await api.placeOrder(order);
      // No answer: the order may or may not have run. The same clientOrderId makes asking
      // again safe, and the server answers with the original order if it did.
      if (result.kind === "failed") result = await api.placeOrder(order);
      if (result.kind === "filled") {
        setRevision((r) => r + 1);
        reload();
      }
      return result;
    },
    [api, reload],
  );

  const reset = useCallback(async () => {
    latest.current += 1;
    const fresh = await api.reset();
    setAccount(fresh);
    setLoadFailed(false);
    setRevision((r) => r + 1);
  }, [api]);

  const value = useMemo<PortfolioContextValue>(
    () => ({
      status: account !== null ? "ready" : loadFailed ? "error" : "loading",
      account,
      loadFailed,
      reload,
      placeOrder,
      reset,
      revision,
      api,
    }),
    [account, loadFailed, reload, placeOrder, reset, revision, api],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const value = useContext(PortfolioContext);
  if (value === null) throw new Error("usePortfolio needs a PortfolioProvider");
  return value;
}
