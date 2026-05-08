import type { FeedEvent } from "../../types";
import type { JSX } from "react";
import { formatPrice } from "../../utils/format";

type Props = {
  feed: FeedEvent[];
};

export function LiveFeed({ feed }: Props): JSX.Element {
  return (
    <aside
      style={{
        width: 300,
        background: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-subtle)",
        padding: "14px 14px 10px",
      }}
    >
      <div style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
        Live Feed
      </div>
      <div style={{ maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
        {feed.map((item) => (
          <div key={item.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-subtle)", animation: "feedIn 200ms ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span className="mono" style={{ background: "var(--bg-elevated)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>
                  {item.symbol}
                </span>
                <span className="mono" style={{ marginLeft: 8 }}>{formatPrice(item.price)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    fontSize: 9,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: item.side === "buy" ? "var(--accent-teal)" : "var(--accent-red)",
                    color: "var(--text-inverse)",
                    fontWeight: 700,
                  }}
                >
                  {item.side === "buy" ? "B" : "S"}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
