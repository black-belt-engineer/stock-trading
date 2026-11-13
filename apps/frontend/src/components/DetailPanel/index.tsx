import { useEffect, useState } from "react";
import type { JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Sparkline } from "../Sparkline";
import type { StreamStatus } from "../../hooks/usePriceStream";
import type { ActiveStock, SnapshotData } from "../../types";
import { formatChange, formatPrice, formatTimeAgo, formatVolume } from "../../utils/format";

type Props = {
  /** Live object for the selected symbol; `null` closes the dialog. */
  stock: ActiveStock | null;
  streamStatus: StreamStatus;
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

export function DetailPanel({ stock, streamStatus, onOpenChange }: Props): JSX.Element {
  const symbol = stock?.symbol ?? null;
  const [snapshot, setSnapshot] = useState<SnapshotState | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Price, change and sparkline come from the live `stock`. This request only
  // supplies the fields the live object lacks, once per open (and per retry).
  useEffect(() => {
    if (!symbol) return;
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
  }, [symbol, attempt]);

  // Ignore state left over from a previous symbol until the effect replaces it.
  const current: SnapshotState | null =
    symbol === null ? null : snapshot?.symbol === symbol ? snapshot : { symbol, status: "loading" };

  const trendUp = (stock?.changePercent ?? 0) >= 0;
  const stale = streamStatus !== "live";

  return (
    <Dialog.Root open={stock !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-overlay backdrop-blur-[6px]" />
        <Dialog.Content
          aria-describedby="detail-panel-description"
          className={
            "fixed top-1/2 left-1/2 max-h-[calc(100vh-32px)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 " +
            "overflow-y-auto rounded-[14px] border border-default bg-surface shadow-dialog"
          }
        >
          <VisuallyHidden.Root>
            <Dialog.Title>{`Stock details for ${symbol ?? "symbol"}`}</Dialog.Title>
            <Dialog.Description id="detail-panel-description">
              Live price, change and recent trend, with high, low and volume since the data started.
            </Dialog.Description>
          </VisuallyHidden.Root>
          <header className="flex justify-between border-b border-subtle p-5">
            <div>
              <div className="font-mono text-[20px] font-semibold">{symbol ?? "-"}</div>
              <div className="text-secondary">{stock?.name || symbol || ""}</div>
            </div>
            <Dialog.Close
              aria-label="Close"
              className={`cursor-pointer rounded-sm text-[24px] text-secondary transition-colors duration-150 hover:text-primary ${focusRing}`}
            >
              ×
            </Dialog.Close>
          </header>

          {stock && current && (
            <>
              <section className="px-5 pt-5 pb-3 text-center">
                <div className="font-mono text-[36px] font-semibold">{formatPrice(stock.currentPrice)}</div>
                <div className={`font-mono ${trendUp ? "text-positive" : "text-negative"}`}>
                  {formatSignedPrice(stock.changeValue)} / {formatChange(stock.changePercent)}
                </div>
                {stale && (
                  <div role="status" className="mt-2 text-[11px] text-warning">
                    Stream {streamStatus === "disconnected" ? "disconnected" : "reconnecting"} — values may be out of date
                  </div>
                )}
              </section>

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
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className={`cursor-pointer rounded-md border border-default bg-elevated px-3.5 py-1.5 text-primary transition-colors duration-150 hover:border-strong ${focusRing}`}
                  >
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
                      <div className="text-[11px] text-secondary uppercase">{label}</div>
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
  const high = Math.max(data.high24h, stock.currentPrice);
  const low = Math.min(data.low24h, stock.currentPrice);
  return [
    ["High since start", formatPrice(high)],
    ["Low since start", formatPrice(low)],
    ["Volume since start", formatVolume(data.volume24h)],
    ["Previous tick", formatPrice(stock.currentPrice - stock.changeValue)],
    ["Range since start", formatPrice(high - low)],
    ["Last updated", formatTimeAgo(stock.lastUpdated)],
  ];
}
