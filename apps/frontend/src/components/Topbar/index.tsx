import { formatTimeAgo } from "../../utils/format";
import type { JSX } from "react";
import type { ActiveStock } from "../../types";

type Props = {
  stocks: ActiveStock[];
  lastUpdate: number;
};

export function Topbar({ stocks, lastUpdate }: Props): JSX.Element {
  const best = stocks.reduce((prev, item) => (item.changePercent > prev.changePercent ? item : prev), stocks[0] ?? emptyStock);
  const worst = stocks.reduce((prev, item) => (item.changePercent < prev.changePercent ? item : prev), stocks[0] ?? emptyStock);

  const blocks = [
    { label: "Active Symbols", value: String(stocks.length), color: "var(--text-primary)" },
    { label: "Best Performer", value: best.symbol || "-", color: "var(--accent-green)" },
    { label: "Worst Performer", value: worst.symbol || "-", color: "var(--accent-red)" },
    { label: "Last Update", value: formatTimeAgo(lastUpdate || Date.now()), color: "var(--text-primary)" },
  ];

  return (
    <section
      className="card-surface"
      style={{ borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}
    >
      {blocks.map((block, i) => (
        <div key={block.label} style={{ padding: i === 0 ? "0 10px 0 0" : "0 10px", borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
          <div style={{ color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>{block.label}</div>
          <div className="mono" style={{ marginTop: 6, fontSize: 18, color: block.color }}>
            {block.value}
          </div>
        </div>
      ))}
    </section>
  );
}

const emptyStock: ActiveStock = {
  symbol: "",
  name: "",
  currentPrice: 0,
  changePercent: 0,
  changeValue: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
  sparkline: [],
  lastUpdated: 0,
};
