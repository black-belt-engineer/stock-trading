import { useRef } from "react";
import type { JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Sparkline } from "../Sparkline";
import { StaleBanner } from "../StaleBanner";
import type { ActiveStock, ListStatus } from "../../types";
import { formatChange, formatPrice, formatTimeAgo, formatVolume, NO_VALUE } from "../../utils/format";

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

function formatSignedPrice(n: number): string {
  return `${n > 0 ? "+" : ""}${formatPrice(n)}`;
}

const tileGrid = "grid grid-cols-2 gap-2 px-5 pb-5";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const buttonClass =
  "cursor-pointer rounded-md border border-default bg-elevated px-3.5 py-1.5 text-primary transition-colors duration-150 " +
  `hover:border-strong ${focusRing}`;

export function DetailPanel({ symbol, stock, listStatus, onRetryList, stale, onOpenChange }: Props): JSX.Element {
  const trendUp = (stock?.changePercent ?? 0) >= 0;

  // The symbol prop is already null by the time the dialog finishes closing,
  // so remember which one was open.
  const lastSymbolRef = useRef<string | null>(null);
  if (symbol !== null) lastSymbolRef.current = symbol;

  // The control that opened the dialog: a card or a mover. Read while
  // rendering the first open frame, before Radix moves focus into the dialog.
  // A dialog opened from a link has none (focus is on <body>).
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (symbol !== null && !wasOpenRef.current) {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpenRef.current = symbol !== null;

  // Radix returns focus to a Dialog.Trigger, but this dialog is opened through
  // the URL and has none, so focus would fall to <body>. Send it back to the
  // control that opened it if that is still on the page, otherwise to the
  // symbol's card (also when the dialog was opened from a link). If neither
  // exists (symbol not found, or filtered out), Radix's default applies.
  const returnFocus = (event: Event): void => {
    const opener = openerRef.current;
    openerRef.current = null;
    const last = lastSymbolRef.current;
    const card = last ? document.querySelector<HTMLElement>(`[data-symbol="${CSS.escape(last)}"]`) : null;
    const target = opener?.isConnected ? opener : card;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <Dialog.Root open={symbol !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-overlay backdrop-blur-[6px]" />
        <Dialog.Content
          aria-describedby="detail-panel-description"
          onCloseAutoFocus={returnFocus}
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
              Live price, change since the previous close and recent trend, with today's open, high, low and volume.
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

          {stock && (
            <>
              <section className={`px-5 pt-5 pb-3 text-center transition-[filter] duration-300 ${stale ? "grayscale" : ""}`}>
                <div className="font-mono text-[36px] font-semibold wrap-anywhere">{formatPrice(stock.currentPrice)}</div>
                {stock.change === null || stock.changePercent === null ? (
                  <div className="text-secondary">No trades yet</div>
                ) : (
                  <div className={`font-mono ${trendUp ? "text-positive" : "text-negative"}`}>
                    {formatSignedPrice(stock.change)} / {formatChange(stock.changePercent)}
                  </div>
                )}
              </section>

              <StaleBanner compact />

              <section className="min-h-24 px-5 pb-4">
                <Sparkline prices={stock.sparkline} height={96} />
              </section>

              {stock.sessionId === null ? (
                <section className="px-5 pb-5 text-center text-secondary">No data yet</section>
              ) : (
                <section className={tileGrid}>
                  {tiles(stock).map(([label, value]) => (
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
 * The day values of the symbol's current session, live from the stream like
 * the price above them, so they move with every tick and reset when a new
 * session starts.
 */
function tiles(stock: ActiveStock): [string, string][] {
  return [
    ["Open", formatPrice(stock.open)],
    ["Previous close", formatPrice(stock.previousClose)],
    ["Day high", formatPrice(stock.high)],
    ["Day low", formatPrice(stock.low)],
    ["Day volume", formatVolume(stock.volume)],
    ["Last updated", stock.lastUpdated > 0 ? formatTimeAgo(stock.lastUpdated) : NO_VALUE],
  ];
}
