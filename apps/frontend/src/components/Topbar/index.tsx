import { formatTimeAgo } from "../../utils/format";
import type { JSX } from "react";
import type { ActiveStock } from "../../types";

type Props = {
  stocks: ActiveStock[];
  /** Newest tick time (epoch ms), or 0 when there has been none. */
  lastUpdate: number;
};

export function Topbar({ stocks, lastUpdate }: Props): JSX.Element {
  const best = stocks.reduce((prev, item) => (item.changePercent > prev.changePercent ? item : prev), stocks[0] ?? emptyStock);
  const worst = stocks.reduce((prev, item) => (item.changePercent < prev.changePercent ? item : prev), stocks[0] ?? emptyStock);

  const blocks = [
    { label: "Active Symbols", value: String(stocks.length), color: "text-primary" },
    { label: "Best Performer", value: best.symbol || "—", color: "text-positive" },
    { label: "Worst Performer", value: worst.symbol || "—", color: "text-negative" },
    // No update yet reads "—"; substituting the current time would claim "0s ago".
    { label: "Last Update", value: lastUpdate > 0 ? formatTimeAgo(lastUpdate) : "—", color: "text-primary" },
  ];

  return (
    // Four across from md up, 2×2 below; the divider is dropped at the start of each row.
    <section className="grid grid-cols-2 gap-y-3.5 rounded-[10px] border border-default bg-surface px-4 py-3.5 shadow-card md:grid-cols-4">
      {blocks.map((block) => (
        <div
          key={block.label}
          className="min-w-0 border-l border-subtle px-2.5 max-md:odd:border-l-0 max-md:odd:pl-0 md:first:border-l-0 md:first:pl-0"
        >
          <div className="truncate text-[12px] tracking-widest text-secondary uppercase">{block.label}</div>
          <div className={`mt-1.5 font-mono text-[18px] ${block.color}`}>{block.value}</div>
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
