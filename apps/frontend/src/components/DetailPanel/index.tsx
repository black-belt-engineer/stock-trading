import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Sparkline } from "../Sparkline";
import { StaleBanner } from "../StaleBanner";
import type { ActiveStock, ListStatus, SnapshotData } from "../../types";
import { formatChange, formatPrice, formatTimeAgo, formatVolume } from "../../utils/format";

type Props = {
  /** Symbol from the URL; `null` closes the dialog. */
  symbol: string | null;
  /** Live object for `symbol`, or `null` while the list loads or when the symbol is unknown. */
  stock: ActiveStock | null;
  listStatus: ListStatus;
  onRetryList: () => void;
  /** The stream has been down for a while: values may be out of date. */
  stale: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Result of the snapshot request, tagged with the symbol it belongs to so a
 * result for one symbol can never render under another symbol's header.
 * `ready` with `data: null` means the server has no ticks for the symbol yet (404).
 */
type SnapshotState =
  | { symbol: string; status: "loading" }
  | { symbol: string; status: "ready"; data: SnapshotData | null }
  | { symbol: string; status: "error" };

function formatSignedPrice(n: number): string {
  return `${n > 0 ? "+" : ""}${formatPrice(n)}`;
}

const tileGrid = "grid grid-cols-2 gap-2 px-5 pb-5";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const buttonClass =
  "cursor-pointer rounded-md border border-default bg-elevated px-3.5 py-1.5 text-primary transition-colors duration-150 " +
  `hover:border-strong ${focusRing}`;

export function DetailPanel({ symbol, stock, listStatus, onRetryList, stale, onOpenChange }: Props): JSX.Element {
  // Only a symbol that is in the list has a snapshot worth fetching.
  const liveSymbol = stock?.symbol ?? null;
  const [snapshot, setSnapshot] = useState<SnapshotState | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Price, change and sparkline come from the live `stock`. This request only
  // supplies the fields the live object lacks, once per open (and per retry).
  useEffect(() => {
    if (!liveSymbol) return;
    const symbol = liveSymbol;
    const controller = new AbortController();
    setSnapshot({ symbol, status: "loading" });

    fetch(`/quotes/${encodeURIComponent(symbol)}/snapshot`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Snapshot request failed with ${response.status}`);
        return (await response.json()) as SnapshotData;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSnapshot({ symbol, status: "ready", data });
      })
      .catch(() => {
        // Aborted means the dialog closed or moved on; that is not an error to show.
        if (controller.signal.aborted) return;
        setSnapshot({ symbol, status: "error" });
      });

    return () => controller.abort();
  }, [liveSymbol, attempt]);

  // Ignore state left over from a previous symbol until the effect replaces it.
  const current: SnapshotState | null =
    liveSymbol === null
      ? null
      : snapshot?.symbol === liveSymbol
        ? snapshot
        : { symbol: liveSymbol, status: "loading" };

  const trendUp = (stock?.changePercent ?? 0) >= 0;

  // The symbol prop is already null by the time the dialog finishes closing,
  // so remember which one was open.
  const lastSymbolRef = useRef<string | null>(null);
  if (symbol !== null) lastSymbolRef.current = symbol;

  // Radix returns focus to a Dialog.Trigger, but this dialog is opened through
  // the URL and has none, so focus would fall to <body>. Send it back to the
  // symbol's card instead, also when the dialog was opened from a link. If the
  // symbol has no card (not found), Radix's default applies.
  const returnFocusToCard = (event: Event): void => {
    const last = lastSymbolRef.current;
    const card = last ? document.querySelector<HTMLElement>(`[data-symbol="${CSS.escape(last)}"]`) : null;
    if (!card) return;
    event.preventDefault();
    card.focus();
  };

  return (
    <Dialog.Root open={symbol !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-overlay backdrop-blur-[6px]" />
        <Dialog.Content
          aria-describedby="detail-panel-description"
          onCloseAutoFocus={returnFocusToCard}
          className={
            // Narrow: a full-screen sheet, clear of the home indicator. From md up: a centred card.
            "fixed inset-0 overflow-y-auto bg-surface pb-[env(safe-area-inset-bottom)] " +
            "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-32px)] md:w-[min(420px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 " +
            "md:rounded-[14px] md:border md:border-default md:pb-0 md:shadow-dialog"
          }
        >
          <VisuallyHidden.Root>
            <Dialog.Title>{`Stock details for ${symbol ?? "symbol"}`}</Dialog.Title>
            <Dialog.Description id="detail-panel-description">
              Live price, change and recent trend, with high, low and volume since the data started.
            </Dialog.Description>
          </VisuallyHidden.Root>
          <header className="flex justify-between gap-3 border-b border-subtle p-5">
            <div className="min-w-0">
              <div className="font-mono text-[20px] font-semibold">{symbol ?? "-"}</div>
              <div className="text-secondary">{stock?.name || symbol || ""}</div>
            </div>
            <Dialog.Close
              aria-label="Close"
              className={`-mt-1.5 -mr-1.5 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-[24px] text-secondary transition-colors duration-150 hover:text-primary ${focusRing}`}
            >
              ×
            </Dialog.Close>
          </header>

          {!stock && listStatus === "loading" && (
            <section aria-busy="true" className="px-5 py-8 text-center text-secondary">
              Loading…
            </section>
          )}

          {!stock && listStatus === "error" && (
            <section role="alert" className="px-5 py-8 text-center">
              <div className="mb-2.5 text-secondary">Could not load the symbol list.</div>
              <button type="button" onClick={onRetryList} className={buttonClass}>
                Retry
              </button>
            </section>
          )}

          {!stock && listStatus === "ready" && (
            <section role="alert" className="px-5 py-8 text-center">
              <div className="mb-1 font-medium">Symbol not found</div>
              <div className="mb-3 text-secondary">{symbol} is not one of the symbols on this dashboard.</div>
              <Dialog.Close className={buttonClass}>Back to quotes</Dialog.Close>
            </section>
          )}

          {stock && current && (
            <>
              <section className={`px-5 pt-5 pb-3 text-center transition-[filter] duration-300 ${stale ? "grayscale" : ""}`}>
                <div className="font-mono text-[36px] font-semibold wrap-anywhere">{formatPrice(stock.currentPrice)}</div>
                {stock.changeValue === null || stock.changePercent === null ? (
                  <div className="text-secondary">No trades yet</div>
                ) : (
                  <div className={`font-mono ${trendUp ? "text-positive" : "text-negative"}`}>
                    {formatSignedPrice(stock.changeValue)} / {formatChange(stock.changePercent)}
                  </div>
                )}
              </section>

              <StaleBanner compact />

              <section className="min-h-24 px-5 pb-4">
                <Sparkline prices={stock.sparkline} height={96} />
              </section>

              {current.status === "loading" && (
                <section aria-busy="true" className={tileGrid}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-[52px] animate-skeleton rounded-md bg-elevated motion-reduce:animate-none" />
                  ))}
                </section>
              )}

              {current.status === "error" && (
                <section role="alert" className="px-5 pb-5 text-center">
                  <div className="mb-2.5 text-secondary">Could not load high, low and volume for {stock.symbol}.</div>
                  <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass}>
                    Retry
                  </button>
                </section>
              )}

              {current.status === "ready" && current.data === null && (
                <section className="px-5 pb-5 text-center text-secondary">No data yet</section>
              )}

              {current.status === "ready" && current.data !== null && (
                <section className={tileGrid}>
                  {tiles(stock, current.data).map(([label, value]) => (
                    <div key={label} className="rounded-md bg-elevated p-3">
                      <div className="text-[12px] text-secondary uppercase">{label}</div>
                      <div className="font-mono text-[15px] font-medium">{value}</div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Labels say what the values are today: running figures since the consumer
 * first saw the symbol, not session values (those arrive with M2).
 *
 * The snapshot is fetched once, so high and low are widened by the live price
 * and "previous tick" is derived from the live change; otherwise they would
 * contradict the price shown above them. Volume is as of when the dialog opened.
 */
function tiles(stock: ActiveStock, data: SnapshotData): [string, string][] {
  // The list may predate the symbol's first tick while the snapshot does not.
  const price = stock.currentPrice ?? data.currentPrice;
  const change = stock.changeValue ?? data.changeValue;
  const high = Math.max(data.high24h, price);
  const low = Math.min(data.low24h, price);
  return [
    ["High since start", formatPrice(high)],
    ["Low since start", formatPrice(low)],
    ["Volume since start", formatVolume(data.volume24h)],
    ["Previous tick", formatPrice(price - change)],
    ["Range since start", formatPrice(high - low)],
    ["Last updated", formatTimeAgo(stock.lastUpdated || data.lastUpdated)],
  ];
}
