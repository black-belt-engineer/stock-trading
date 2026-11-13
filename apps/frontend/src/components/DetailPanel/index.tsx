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

const tileGrid = { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 } as const;

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
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} />
        <Dialog.Content
          className="card-surface"
          aria-describedby="detail-panel-description"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(420px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          <VisuallyHidden.Root>
            <Dialog.Title>{`Stock details for ${symbol ?? "symbol"}`}</Dialog.Title>
            <Dialog.Description id="detail-panel-description">
              Live price, change and recent trend, with high, low and volume since the data started.
            </Dialog.Description>
          </VisuallyHidden.Root>
          <header style={{ padding: 20, borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{symbol ?? "-"}</div>
              <div style={{ color: "var(--text-secondary)" }}>{stock?.name || symbol || ""}</div>
            </div>
            <Dialog.Close aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 24, cursor: "pointer" }}>×</Dialog.Close>
          </header>

          {stock && current && (
            <>
              <section style={{ padding: "20px 20px 12px", textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 36, fontWeight: 600 }}>{formatPrice(stock.currentPrice)}</div>
                <div className="mono" style={{ color: trendUp ? "var(--positive)" : "var(--negative)" }}>
                  {formatSignedPrice(stock.changeValue)} / {formatChange(stock.changePercent)}
                </div>
                {stale && (
                  <div role="status" style={{ marginTop: 8, fontSize: 11, color: "var(--warning)" }}>
                    Stream {streamStatus === "disconnected" ? "disconnected" : "reconnecting"} — values may be out of date
                  </div>
                )}
              </section>

              <section style={{ padding: "0 20px 16px", minHeight: 96 }}>
                <Sparkline prices={stock.sparkline} height={96} />
              </section>

              {current.status === "loading" && (
                <section aria-busy="true" style={{ padding: "0 20px 20px", ...tileGrid }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ height: 52, borderRadius: 6, background: "var(--bg-elevated)", animation: "pulseReconnecting 1.1s infinite" }} />
                  ))}
                </section>
              )}

              {current.status === "error" && (
                <section role="alert" style={{ padding: "0 20px 20px", textAlign: "center" }}>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 10 }}>
                    Could not load high, low and volume for {stock.symbol}.
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                      padding: "6px 14px",
                      cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                </section>
              )}

              {current.status === "ready" && current.data === null && (
                <section style={{ padding: "0 20px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
                  No data yet
                </section>
              )}

              {current.status === "ready" && current.data !== null && (
                <section style={{ padding: "0 20px 20px", ...tileGrid }}>
                  {tiles(stock, current.data).map(([label, value]) => (
                    <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
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
