import { PriceCard } from "../PriceCard";
import type { JSX } from "react";
import type { ActiveStock, ListStatus } from "../../types";

/**
 * A card counts as delayed when its symbol has had no tick for this long while
 * the stream itself is live (the ingestor or consumer is down). The simulator
 * ticks every symbol once a second, so this is five missed ticks.
 */
export const DELAYED_AFTER_MS = 5000;

type Props = {
  stocks: ActiveStock[];
  status: ListStatus;
  onRetry: () => void;
  onOpen: (symbol: string) => void;
  /** The stream has been down for a while: dim every card. */
  stale: boolean;
  /** Whether per-card delay markers apply: only while the stream is live. */
  live: boolean;
  now: number;
};

const SKELETON_CARDS = 6;
const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3";

export function PriceGrid({ stocks, status, onRetry, onOpen, stale, live, now }: Props): JSX.Element {
  if (status === "loading" && stocks.length === 0) {
    return (
      <section aria-busy="true" aria-label="Loading quotes" className={gridClass}>
        {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
          <div
            key={i}
            className="min-h-[154px] animate-skeleton rounded-[10px] border border-default bg-surface motion-reduce:animate-none"
          />
        ))}
      </section>
    );
  }

  if (status === "error" && stocks.length === 0) {
    return (
      <section role="alert" className="rounded-[10px] border border-default bg-surface px-4 py-8 text-center">
        <div className="mb-2.5 text-secondary">Could not load the list of symbols.</div>
        <button
          type="button"
          onClick={onRetry}
          className={
            "cursor-pointer rounded-md border border-default bg-elevated px-3.5 py-1.5 text-primary transition-colors duration-150 hover:border-strong " +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          }
        >
          Retry
        </button>
      </section>
    );
  }

  if (stocks.length === 0) {
    return (
      <section className="rounded-[10px] border border-default bg-surface px-4 py-8 text-center text-secondary">
        No symbols available
      </section>
    );
  }

  return (
    <section className={`${gridClass} transition-opacity duration-300 ${stale ? "opacity-50" : ""}`}>
      {stocks.map((stock) => (
        <PriceCard
          key={stock.symbol}
          stock={stock}
          onOpen={onOpen}
          delayed={live && now - stock.lastUpdated > DELAYED_AFTER_MS}
        />
      ))}
    </section>
  );
}
