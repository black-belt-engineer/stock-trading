import { memo, useEffect, useState } from "react";
import type { JSX } from "react";
import { Sparkline } from "../Sparkline";
import { focusRing } from "../pageStyles";
import {
  formatPrice,
  formatSignedAmount,
  formatSignedPercent,
  formatVolume,
  formatVolumeCompact,
  NO_VALUE,
} from "../../utils/format";
import { defaultDirection } from "../../utils/quoteView";
import type { QuoteSort, SortKey } from "../../utils/quoteView";
import type { ActiveStock } from "../../types";

type Props = {
  stocks: ActiveStock[];
  sort: QuoteSort;
  onSortChange: (sort: QuoteSort) => void;
  onOpen: (symbol: string) => void;
  /** Symbols without a tick for a while although the stream is live. */
  isDelayed: (stock: ActiveStock) => boolean;
};

/**
 * Columns hidden below Tailwind's `md`: the plan's low-priority ones (name, high,
 * low), and, by the owner's decision, the day change in dollars and the trend,
 * which do not fit a phone; the day % keeps the direction.
 */
const WIDE_ONLY = "max-md:hidden";

const cell = "px-2 py-2 whitespace-nowrap xl:px-2.5";
const numeric = `${cell} text-right font-mono tabular-nums`;

/**
 * The quotes as a table (D3). Header clicks share the sort with the toolbar's
 * Sort control. Each row's symbol is a button that opens the detail dialog, so
 * a row is one tab stop; a click anywhere on the row does the same.
 */
export function QuoteTable({ stocks, sort, onSortChange, onOpen, isDelayed }: Props): JSX.Element {
  const header = (key: SortKey, label: string, align: "left" | "right"): JSX.Element => {
    const active = sort.key === key;
    const onClick = (): void => {
      const direction = active ? (sort.direction === "asc" ? "desc" : "asc") : defaultDirection(key);
      onSortChange({ key, direction });
    };
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
        className={`${cell} ${align === "right" ? "text-right" : "text-left"} font-normal`}
      >
        <button
          type="button"
          onClick={onClick}
          className={
            `inline-flex cursor-pointer items-center gap-0.5 rounded-sm uppercase tracking-wider hover:text-primary ${focusRing} ` +
            (active ? "text-primary" : "")
          }
        >
          {label}
          <span aria-hidden="true" className={`w-2.5 text-center ${active ? "" : "opacity-0"}`}>
            {active && sort.direction === "asc" ? "▲" : "▼"}
          </span>
        </button>
      </th>
    );
  };

  const plain = (label: string, className: string): JSX.Element => (
    <th scope="col" className={`${cell} ${className} font-normal uppercase tracking-wider`}>
      {label}
    </th>
  );

  return (
    <table className="w-full border-separate border-spacing-0 rounded-[10px] border border-default bg-surface text-[13px] shadow-card">
      <caption className="sr-only">Quotes. Column headers with a button sort the table.</caption>
      {/*
        Sticks to the top of the page's scrolling area while the rows scroll under it.
        A sticky element stops at the scroller's padding edge, so the offset is minus
        main's top padding (AppShell: py-4, md:py-[18px]); otherwise rows would show
        in the strip above the header.
      */}
      <thead className="sticky -top-4 z-10 text-[11px] text-secondary md:-top-[18px]">
        <tr className="[&>th]:border-b [&>th]:border-default [&>th]:bg-surface [&>th:first-child]:rounded-tl-[10px] [&>th:last-child]:rounded-tr-[10px]">
          {header("symbol", "Symbol", "left")}
          {plain("Name", `text-left ${WIDE_ONLY}`)}
          {header("price", "Last", "right")}
          {plain("Day chg", `text-right ${WIDE_ONLY}`)}
          {header("change", "Day %", "right")}
          {plain("High", `text-right ${WIDE_ONLY}`)}
          {plain("Low", `text-right ${WIDE_ONLY}`)}
          {header("volume", "Volume", "right")}
          {plain("Trend", `text-left ${WIDE_ONLY}`)}
        </tr>
      </thead>
      <tbody>
        {stocks.map((stock) => (
          <QuoteRow key={stock.symbol} stock={stock} onOpen={onOpen} delayed={isDelayed(stock)} />
        ))}
      </tbody>
    </table>
  );
}

const flashClass = {
  "": "",
  up: "animate-flash-bg-up motion-reduce:animate-none",
  down: "animate-flash-bg-down motion-reduce:animate-none",
} as const;

const toneClass = { none: "text-secondary", up: "text-positive", down: "text-negative" } as const;

type RowProps = {
  stock: ActiveStock;
  onOpen: (symbol: string) => void;
  delayed: boolean;
};

/** Memoised on its own stock, so a tick re-renders only that symbol's row. */
const QuoteRow = memo(function QuoteRow({ stock, onOpen, delayed }: RowProps): JSX.Element {
  const [flash, setFlash] = useState<keyof typeof flashClass>("");
  const { lastUpdated, tickDirection } = stock;

  useEffect(() => {
    if (lastUpdated === 0 || tickDirection === "flat") return;
    setFlash(tickDirection);
    const timer = window.setTimeout(() => setFlash(""), 600);
    return () => window.clearTimeout(timer);
  }, [lastUpdated, tickDirection]);

  const tone = stock.changePercent === null ? "none" : stock.changePercent >= 0 ? "up" : "down";
  const name = stock.name || stock.symbol;
  const open = (): void => onOpen(stock.symbol);

  return (
    <tr
      onClick={(event) => {
        // The row's button is the focus target, so the dialog returns focus to it on close.
        const button = event.currentTarget.querySelector<HTMLButtonElement>("button[data-symbol]");
        if (button && event.target !== button) button.focus();
        open();
      }}
      className="cursor-pointer transition-colors duration-150 hover:bg-elevated has-[:focus-visible]:bg-elevated [&>td]:border-b [&>td]:border-subtle last:[&>td]:border-b-0"
    >
      <td className={cell}>
        <button
          type="button"
          // Found again by the detail dialog to return focus here when it closes.
          data-symbol={stock.symbol}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
          className={`cursor-pointer rounded-sm font-mono font-semibold ${focusRing}`}
        >
          {stock.symbol}
        </button>
        {delayed && stock.currentPrice !== null && (
          <span title="No recent updates for this symbol" className="ml-1.5 text-[11px] text-warning">
            Delayed
          </span>
        )}
      </td>
      {/* Takes whatever width the other columns leave, and cuts the name to fit. */}
      <td className={`${cell} ${WIDE_ONLY} w-full max-w-0 truncate text-secondary`} title={name}>
        {name}
      </td>
      <td className={`${numeric} ${flashClass[flash]}`}>{formatPrice(stock.currentPrice)}</td>
      <td className={`${numeric} ${WIDE_ONLY} ${toneClass[tone]}`}>{formatSignedAmount(stock.change)}</td>
      <td className={`${numeric} ${toneClass[tone]}`}>
        {stock.changePercent === null ? NO_VALUE : formatSignedPercent(stock.changePercent)}
      </td>
      <td className={`${numeric} ${WIDE_ONLY}`}>{formatPrice(stock.high)}</td>
      <td className={`${numeric} ${WIDE_ONLY}`}>{formatPrice(stock.low)}</td>
      <td className={numeric} title={formatVolume(stock.volume)}>
        <span className="md:hidden">{formatVolumeCompact(stock.volume)}</span>
        <span className="max-md:hidden">{formatVolume(stock.volume)}</span>
      </td>
      <td className={`${cell} ${WIDE_ONLY} w-20 min-w-20`}>
        <Sparkline prices={stock.sparkline} height={24} />
      </td>
    </tr>
  );
});
