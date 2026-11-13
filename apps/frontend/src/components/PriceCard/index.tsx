import { memo, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Sparkline } from "../Sparkline";
import { formatChange, formatPrice } from "../../utils/format";
import type { ActiveStock } from "../../types";

type Props = {
  stock: ActiveStock;
  onOpen: (symbol: string) => void;
  /** No tick for this symbol for a while although the stream is live. */
  delayed: boolean;
};

const flashClass = {
  "": "",
  up: "animate-flash-up motion-reduce:animate-none",
  down: "animate-flash-down motion-reduce:animate-none",
} as const;

function PriceCardBase({ stock, onOpen, delayed }: Props): JSX.Element {
  const [flash, setFlash] = useState<keyof typeof flashClass>("");
  const hasPrice = stock.currentPrice !== null;
  // The badge is the day change (against the previous close); the flash is
  // the last tick's move, so the two can differ.
  const trendUp = (stock.changePercent ?? 0) >= 0;
  const { lastUpdated, tickDirection } = stock;

  useEffect(() => {
    if (lastUpdated === 0 || tickDirection === "flat") return;
    setFlash(tickDirection);
    const timer = window.setTimeout(() => setFlash(""), 600);
    return () => window.clearTimeout(timer);
  }, [lastUpdated, tickDirection]);

  const companyName = useMemo(() => stock.name || stock.symbol, [stock.name, stock.symbol]);

  // The button's whole name, read once when it gets focus. Not a live region:
  // six cards ticking every second would drown out everything else.
  const label =
    `${stock.symbol}, ${companyName}, ` +
    (stock.currentPrice === null
      ? "no price yet"
      : formatPrice(stock.currentPrice) +
        (stock.changePercent === null
          ? ""
          : `, ${trendUp ? "up" : "down"} ${Math.abs(stock.changePercent).toFixed(2)}% today`)) +
    (delayed && hasPrice ? ", no recent updates" : "");

  // A button, so it is focusable and opens with Enter and Space. Buttons only
  // hold phrasing content, hence spans styled as blocks instead of divs.
  return (
    <button
      type="button"
      onClick={() => onOpen(stock.symbol)}
      aria-label={label}
      // Found again by the detail dialog to return focus here when it closes.
      data-symbol={stock.symbol}
      className={
        "block min-h-[154px] w-full cursor-pointer rounded-[10px] border border-default bg-surface px-4 py-3.5 text-left shadow-card " +
        "transition-colors duration-150 hover:border-strong hover:bg-elevated " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      }
    >
      <span className="flex justify-between gap-2">
        <span className="block min-w-0">
          <span className="block font-mono font-semibold">{stock.symbol}</span>
          {/* Long names ("Microsoft Corporation") are cut with an ellipsis; the title shows them whole. */}
          <span title={companyName} className="mt-0.5 block truncate text-[12px] text-secondary">
            {companyName}
          </span>
        </span>
        <span
          className={
            "shrink-0 self-start rounded-full px-2 py-0.5 font-mono text-[12px] font-semibold " +
            (stock.changePercent === null
              ? "bg-elevated text-secondary"
              : trendUp
                ? "bg-positive/15 text-positive"
                : "bg-negative/15 text-negative")
          }
        >
          {formatChange(stock.changePercent)}
        </span>
      </span>
      {/* Wraps rather than overflows: a long price breaks onto two lines and "Delayed" drops below it. */}
      <span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className={`block min-w-0 font-mono text-[24px] leading-[1.15] font-semibold wrap-anywhere ${flashClass[flash]}`}>
          {formatPrice(stock.currentPrice)}
        </span>
        {delayed && hasPrice && (
          <span
            title="No recent updates for this symbol"
            className="rounded-full border border-warning/40 px-2 py-0.5 text-[12px] font-medium text-warning"
          >
            Delayed
          </span>
        )}
      </span>
      <span className="mt-2.5 block w-full">
        <Sparkline prices={stock.sparkline} height={40} />
      </span>
    </button>
  );
}

export const PriceCard = memo(PriceCardBase);
