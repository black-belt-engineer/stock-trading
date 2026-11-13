import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Topbar } from "../components/Topbar";
import { PriceGrid } from "../components/PriceGrid";
import { DetailPanel } from "../components/DetailPanel";
import { ALL_SECTORS, SectorFilter, sectorId } from "../components/SectorFilter";
import type { SectorOption } from "../components/SectorFilter";
import { useStreamData, useStreamStatus } from "../stream/StreamProvider";
import { isRecord } from "../utils/guards";

/** Marks a history entry the dashboard pushed itself, so closing the dialog can go back. */
type DialogState = { openedFromList: true };

/** History state can be anything another page or a reload left there; check it field by field. */
function isOpenedFromList(state: unknown): boolean {
  return isRecord(state) && state.openedFromList === true;
}

export function QuotesPage(): JSX.Element {
  const [now, setNow] = useState(Date.now());
  const { stocks, listStatus, retryList } = useStreamData();
  const { status, stale } = useStreamStatus();

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Drives "x ago" and the delayed markers. Background tabs throttle the
  // interval, so catch up as soon as the tab is visible again.
  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Sector pills come from the sectors in the list, so a new sector needs no frontend change.
  const sectors = useMemo<SectorOption[]>(() => {
    const names = [...new Set(stocks.map((s) => s.sector))].sort((x, y) => x.localeCompare(y));
    return names.map((label) => ({ id: sectorId(label), label }));
  }, [stocks]);

  // The filter lives in the URL (`/?sector=financials`), so a view survives a reload.
  const rawSector = searchParams.get("sector");
  const sector = sectors.find((s) => s.id === rawSector)?.id ?? ALL_SECTORS;

  // Drop a sector the list does not have (a stale link), without a history entry.
  useEffect(() => {
    if (rawSector === null || listStatus !== "ready" || sector !== ALL_SECTORS) return;
    const next = new URLSearchParams(searchParams);
    next.delete("sector");
    const search = next.toString();
    navigate({ search: search ? `?${search}` : "" }, { replace: true, state: location.state });
  }, [rawSector, sector, listStatus, searchParams, location.state, navigate]);

  const changeSector = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (id === ALL_SECTORS) next.delete("sector");
      else next.set("sector", id);
      const search = next.toString();
      // Replaced, not pushed: Back leaves the page instead of stepping through filters.
      navigate({ search: search ? `?${search}` : "" }, { replace: true, state: location.state });
    },
    [searchParams, location.state, navigate],
  );

  const filtered = useMemo(
    () => (sector === ALL_SECTORS ? stocks : stocks.filter((s) => sectorId(s.sector) === sector)),
    [sector, stocks],
  );

  // The open symbol lives in the URL (`/?symbol=AAPL`), so the dialog is linkable.
  const rawSymbol = searchParams.get("symbol")?.trim() || null;
  const selected = rawSymbol?.toUpperCase() ?? null;

  // Normalise `?symbol=aapl` to upper case without adding a history entry.
  useEffect(() => {
    if (selected === null || rawSymbol === selected) return;
    const next = new URLSearchParams(searchParams);
    next.set("symbol", selected);
    navigate({ search: `?${next.toString()}` }, { replace: true, state: location.state });
  }, [rawSymbol, selected, searchParams, location.state, navigate]);

  // From the whole list, not the filtered one: the dialog follows the URL.
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
    if (isOpenedFromList(location.state)) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("symbol");
    const search = next.toString();
    navigate({ search: search ? `?${search}` : "" }, { replace: true });
  }, [location.state, navigate, searchParams]);

  const lastUpdated = useMemo(() => filtered.reduce((acc, s) => Math.max(acc, s.lastUpdated), 0), [filtered]);

  return (
    <>
      {/* The page heading, for screen reader navigation; sighted users see the active nav item. */}
      <h1 className="sr-only">Quotes</h1>
      <Topbar stocks={filtered} lastUpdate={lastUpdated} />
      {sectors.length > 1 && <SectorFilter sectors={sectors} value={sector} onChange={changeSector} />}
      <PriceGrid
        stocks={filtered}
        status={listStatus}
        onRetry={retryList}
        onOpen={openDetail}
        stale={stale}
        live={status === "live"}
        now={now}
      />
      <DetailPanel
        symbol={selected}
        stock={selectedStock}
        listStatus={listStatus}
        onRetryList={retryList}
        stale={stale}
        onOpenChange={(open) => !open && closeDetail()}
      />
    </>
  );
}
