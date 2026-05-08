import { memo, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Sparkline } from "../Sparkline";
import { formatChange, formatPrice } from "../../utils/format";
import type { ActiveStock } from "../../types";

type Props = {
  stock: ActiveStock;
  onOpen: (symbol: string) => void;
};

function PriceCardBase({ stock, onOpen }: Props): JSX.Element {
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");
  const trendUp = stock.changePercent >= 0;

  useEffect(() => {
    setFlash(trendUp ? "flash-up" : "flash-down");
    const timer = window.setTimeout(() => setFlash(""), 600);
    return () => window.clearTimeout(timer);
  }, [stock.currentPrice, trendUp]);

  const companyName = useMemo(() => stock.name || stock.symbol, [stock.name, stock.symbol]);

  return (
    <article
      className="card-surface"
      onClick={() => onOpen(stock.symbol)}
      style={{
        borderRadius: 10,
        padding: "14px 16px",
        minHeight: 154,
        cursor: "pointer",
        transition: "150ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div className="mono" style={{ fontWeight: 600 }}>{stock.symbol}</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>{companyName}</div>
        </div>
        <div
          className="mono"
          style={{
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600,
            background: trendUp ? "rgba(34,197,94,0.15)" : "rgba(240,72,90,0.15)",
            color: trendUp ? "var(--accent-green)" : "var(--accent-red)",
          }}
        >
          {formatChange(stock.changePercent)}
        </div>
      </div>
      <div className={`mono ${flash}`} style={{ marginTop: 8, fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>
        {formatPrice(stock.currentPrice)}
      </div>
      <div style={{ marginTop: 10, width: "100%" }}>
        <Sparkline prices={stock.sparkline} height={40} />
      </div>
    </article>
  );
}

export const PriceCard = memo(PriceCardBase);
