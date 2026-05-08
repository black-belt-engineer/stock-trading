import { useEffect, useState } from "react";
import type { JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import type { SnapshotData } from "../../types";
import { formatPrice, formatTimeAgo, formatVolume } from "../../utils/format";

type Props = {
  symbol: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DetailPanel({ symbol, open, onOpenChange }: Props): JSX.Element {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !symbol) return;
    setLoading(true);
    void fetch(`/quotes/${symbol}/snapshot`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res: SnapshotData | null) => setData(res))
      .finally(() => setLoading(false));
  }, [open, symbol]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
            width: 420,
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          <VisuallyHidden.Root>
            <Dialog.Title>{`Stock details for ${data?.symbol ?? symbol ?? "symbol"}`}</Dialog.Title>
            <Dialog.Description id="detail-panel-description">
              Real-time stock snapshot details including latest price and 24 hour metrics.
            </Dialog.Description>
          </VisuallyHidden.Root>
          <header style={{ padding: 20, borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{data?.symbol ?? symbol ?? "-"}</div>
              <div style={{ color: "var(--text-secondary)" }}>{data?.name ?? "Loading..."}</div>
            </div>
            <Dialog.Close style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 24, cursor: "pointer" }}>×</Dialog.Close>
          </header>
          {loading || !data ? (
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 52, borderRadius: 6, background: "var(--bg-elevated)", animation: "pulseReconnecting 1.1s infinite" }} />
              ))}
            </div>
          ) : (
            <>
              <section style={{ padding: 20, textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 36, fontWeight: 600 }}>{formatPrice(data.currentPrice)}</div>
                <div className="mono" style={{ color: data.changePercent >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {formatPrice(data.changeValue)} / {data.changePercent.toFixed(2)}%
                </div>
              </section>
              <section style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                {[
                  ["24h High", formatPrice(data.high24h)],
                  ["24h Low", formatPrice(data.low24h)],
                  ["Volume", formatVolume(data.volume24h)],
                  ["Prev Close", formatPrice(data.previousPrice)],
                  ["Last Updated", formatTimeAgo(data.lastUpdated)],
                  ["Symbol", data.symbol],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </section>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
