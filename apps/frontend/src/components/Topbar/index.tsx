import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { formatChange, formatTimeAgo, NO_VALUE } from "../../utils/format";
import { moversKey, topMovers, type Mover, type Movers } from "../../utils/movers";
import type { ActiveStock } from "../../types";

type Props = {
  /** The symbols the page shows (the sector filter applied). */
  stocks: ActiveStock[];
  /** Every symbol, for the movers: they are market-wide and ignore the filter. */
  allStocks: ActiveStock[];
  /** Newest tick time (epoch ms), or 0 when there has been none. */
  lastUpdate: number;
  /** Opens the detail dialog for a mover. */
  onOpen: (symbol: string) => void;
};

/** How many gainers and losers the strip lists. */
const MOVERS_LIMIT = 3;

/** The strip changes at most this often, so ranks near a tie do not swap every second. */
const MOVERS_REFRESH_MS = 3000;

const label = "truncate text-[12px] tracking-widest text-secondary uppercase";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function Topbar({ stocks, allStocks, lastUpdate, onOpen }: Props): JSX.Element {
  const movers = useThrottledMovers(allStocks, MOVERS_REFRESH_MS);

  return (
    // Narrow: two figures side by side, the movers in a row below. From md up: one
    // row, the movers between the figures.
    <section className="grid grid-cols-2 gap-y-3.5 rounded-[10px] border border-default bg-surface px-4 py-3.5 shadow-card md:grid-cols-4">
      <div className="min-w-0">
        <div className={label}>Active Symbols</div>
        <div className="mt-1.5 font-mono text-[18px] text-primary">{stocks.length}</div>
      </div>
      <div className="order-last col-span-2 min-w-0 md:order-none md:border-l md:border-subtle md:px-2.5">
        <div className={label}>Top movers · all sectors</div>
        <div className="mt-1.5 grid gap-1">
          <MoverList title="Top gainers" movers={movers.gainers} onOpen={onOpen} />
          <MoverList title="Top losers" movers={movers.losers} onOpen={onOpen} />
        </div>
      </div>
      <div className="min-w-0 border-l border-subtle px-2.5">
        <div className={label}>Last Update</div>
        {/* No update yet reads "—"; substituting the current time would claim "0s ago". */}
        <div className="mt-1.5 font-mono text-[18px] text-primary">
          {lastUpdate > 0 ? formatTimeAgo(lastUpdate) : NO_VALUE}
        </div>
      </div>
    </section>
  );
}

function MoverList({
  title,
  movers,
  onOpen,
}: {
  title: string;
  movers: Mover[];
  onOpen: (symbol: string) => void;
}): JSX.Element {
  return (
    <ul aria-label={title} className="flex min-h-6 flex-wrap items-center gap-x-1 gap-y-0.5">
      {movers.length === 0 && (
        <li className="font-mono text-secondary">
          <span aria-hidden="true">{NO_VALUE}</span>
          <span className="sr-only">none</span>
        </li>
      )}
      {movers.map((mover) => {
        const up = mover.changePercent > 0;
        return (
          <li key={mover.symbol}>
            <button
              type="button"
              onClick={() => onOpen(mover.symbol)}
              aria-label={`${mover.symbol}, ${up ? "up" : "down"} ${Math.abs(mover.changePercent).toFixed(2)}% today`}
              className={`cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-[13px] whitespace-nowrap transition-colors duration-150 hover:bg-elevated ${focusRing}`}
            >
              <span className="font-semibold">{mover.symbol}</span>{" "}
              <span className={up ? "text-positive" : "text-negative"}>{formatChange(mover.changePercent)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Movers of `stocks`, updated at most every `intervalMs`: the first change in
 * a quiet period shows at once, later ones wait for the end of the interval
 * and then show the latest state. Equal results keep the same object.
 */
function useThrottledMovers(stocks: ActiveStock[], intervalMs: number): Movers {
  const latest = useMemo(() => topMovers(stocks, MOVERS_LIMIT), [stocks]);
  const latestKey = moversKey(latest);
  const [shown, setShown] = useState(latest);
  const shownKey = moversKey(shown);
  const shownAt = useRef(0);

  useEffect(() => {
    if (latestKey === shownKey) return;
    const show = (): void => {
      shownAt.current = Date.now();
      setShown(latest);
    };
    const wait = shownAt.current + intervalMs - Date.now();
    if (wait <= 0) {
      show();
      return;
    }
    const timer = window.setTimeout(show, wait);
    return () => window.clearTimeout(timer);
  }, [latest, latestKey, shownKey, intervalMs]);

  return shown;
}
