import { memo, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Sparkline } from "../Sparkline";
import { formatChange, formatPrice } from "../../utils/format";
import type { ActiveStock } from "../../types";

type Props = {
  stock: ActiveStock;
  onOpen: (symbol: string) => void;
};

const flashClass = {
  "": "",
  up: "animate-flash-up motion-reduce:animate-none",
  down: "animate-flash-down motion-reduce:animate-none",
} as const;

function PriceCardBase({ stock, onOpen }: Props): JSX.Element {
  const [flash, setFlash] = useState<keyof typeof flashClass>("");
  const trendUp = stock.changePercent >= 0;

  useEffect(() => {
    setFlash(trendUp ? "up" : "down");
    const timer = window.setTimeout(() => setFlash(""), 600);
    return () => window.clearTimeout(timer);
  }, [stock.currentPrice, trendUp]);

  const companyName = useMemo(() => stock.name || stock.symbol, [stock.name, stock.symbol]);

  return (
    <article
      onClick={() => onOpen(stock.symbol)}
      className={
        "min-h-[154px] cursor-pointer rounded-[10px] border border-default bg-surface px-4 py-3.5 shadow-card " +
        "transition-colors duration-150 hover:border-strong hover:bg-elevated " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      }
    >
      <div className="flex justify-between">
        <div>
          <div className="font-mono font-semibold">{stock.symbol}</div>
          <div className="mt-0.5 text-[11px] text-secondary">{companyName}</div>
        </div>
        <div
          className={
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold " +
            (trendUp ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")
          }
        >
          {formatChange(stock.changePercent)}
        </div>
      </div>
      <div className={`mt-2 font-mono text-[24px] leading-[1.15] font-semibold ${flashClass[flash]}`}>
        {formatPrice(stock.currentPrice)}
      </div>
      <div className="mt-2.5 w-full">
        <Sparkline prices={stock.sparkline} height={40} />
      </div>
    </article>
  );
}

export const PriceCard = memo(PriceCardBase);
