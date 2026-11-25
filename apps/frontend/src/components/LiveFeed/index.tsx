import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, JSX, KeyboardEvent } from "react";
import type { FeedEvent } from "../../types";
import { formatClockTime, formatPrice, formatQuantity } from "../../utils/format";
import { focusRing } from "../pageStyles";

/** Rows the feed shows. The stream hook keeps more, so a one-symbol filter still fills the list. */
export const FEED_ROW_LIMIT = 100;

/** A paused feed counts new trades up to this, then shows "500+". */
export const NEW_COUNT_LIMIT = 500;

/** Filter values that are not symbols. Symbols never start with "*" (`SYMBOL_PATTERN`). */
const ALL = "*all";
const OPEN = "*open";

type Props = {
  feed: FeedEvent[];
  /** Every listed symbol, for the filter. */
  symbols: string[];
  /** The symbol of the open quote dialog, or null when none is open. */
  openSymbol: string | null;
  /** Feed tab selected (narrow) or drawer open (medium). Wide screens always show the feed. */
  open: boolean;
  /** Closes the medium-width drawer. */
  onClose: () => void;
};

/** Matches the medium layout, where the feed is a drawer: Tailwind's md up to xl. */
const DRAWER_QUERY = "(min-width: 48rem) and (not (min-width: 80rem))";

const controlClass =
  "h-8 min-w-0 rounded-md border border-default bg-input px-2 text-[13px] text-primary hover:border-strong " + focusRing;

/**
 * The Live Feed (D2): the newest trades, which can be paused and filtered to one
 * symbol.
 *
 * Pausing keeps the list as it was and counts the trades that arrived since.
 * Besides the Pause button, the feed pauses on its own while the pointer is over
 * the list or focus is in it, so rows do not move under the cursor. Resuming
 * shows the newest rows again. The hook bounds what is kept
 * (`FEED_BUFFER_LIMIT`), so a long pause holds no more memory than a short one.
 */
export function LiveFeed({ feed, symbols, openSymbol, open, onClose }: Props): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState(ALL);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [pointerInList, setPointerInList] = useState(false);
  const [focusInList, setFocusInList] = useState(false);
  const paused = pausedByUser || pointerInList || focusInList;

  // The feed as it was when the pause began, adjusted while rendering so no
  // frame shows a moved list.
  const [snapshot, setSnapshot] = useState<FeedEvent[] | null>(null);
  if (paused && snapshot === null) setSnapshot(feed);
  if (!paused && snapshot !== null) setSnapshot(null);

  // Opening the drawer moves focus into it, so keyboard users land in the feed.
  useEffect(() => {
    if (open && window.matchMedia(DRAWER_QUERY).matches) closeRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && open && window.matchMedia(DRAWER_QUERY).matches) {
      event.stopPropagation();
      onClose();
    }
  };

  const onListBlur = (event: FocusEvent<HTMLOListElement>): void => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
      setFocusInList(false);
    }
  };

  // "Open quote" follows the dialog, and shows every symbol while none is open.
  const target = filter === ALL ? null : filter === OPEN ? openSymbol : filter;

  const shown = snapshot ?? feed;
  const rows = useMemo(() => {
    const matching = target === null ? shown : shown.filter((e) => e.symbol === target);
    return matching.slice(0, FEED_ROW_LIMIT);
  }, [shown, target]);

  const newCount = useMemo(() => {
    if (snapshot === null) return "";
    // Trades newer than the newest one the snapshot had. If that trade has left
    // the hook's buffer, everything in it is new and the count is a lower bound.
    const head = snapshot[0];
    const index = head ? feed.findIndex((e) => e.id === head.id) : feed.length;
    const newer = index === -1 ? feed : feed.slice(0, index);
    const count = target === null ? newer.length : newer.filter((e) => e.symbol === target).length;
    if (count >= NEW_COUNT_LIMIT) return `${NEW_COUNT_LIMIT}+`;
    if (count === 0) return "";
    return index === -1 ? `${count}+` : String(count);
  }, [snapshot, feed, target]);

  return (
    <aside
      id="live-feed"
      aria-label="Live feed"
      onKeyDown={onKeyDown}
      className={
        `${open ? "flex" : "hidden"} min-h-0 flex-col bg-sidebar px-3.5 pt-3.5 pb-2.5 ` +
        // Narrow: the feed tab, in the main area's row.
        "row-start-2 " +
        // Medium: a drawer over the right edge, above the backdrop.
        "md:max-xl:fixed md:max-xl:inset-y-0 md:max-xl:right-0 md:max-xl:z-30 md:max-xl:w-[min(320px,calc(100vw-64px))] " +
        "md:max-xl:border-l md:max-xl:border-default md:max-xl:shadow-dialog " +
        // Wide: the third column, always shown.
        "xl:col-start-3 xl:row-start-1 xl:flex xl:border-l xl:border-subtle"
      }
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-normal tracking-widest text-secondary uppercase">Live Feed</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close live feed"
          className={
            "hidden size-8 cursor-pointer items-center justify-center rounded-md text-[22px] leading-none text-secondary " +
            `transition-colors duration-150 hover:text-primary md:max-xl:inline-flex ${focusRing}`
          }
        >
          ×
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Show trades for</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${controlClass} w-full cursor-pointer`}>
            <option value={ALL}>All symbols</option>
            <option value={OPEN}>Open quote{openSymbol ? ` (${openSymbol})` : ""}</option>
            {symbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPausedByUser((p) => !p)}
          className={`${controlClass} inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-elevated px-3`}
        >
          {pausedByUser ? "Resume" : "Pause"}
          {newCount !== "" && (
            <span className="rounded-full bg-brand-dim px-1.5 font-mono text-[11px] text-brand">{newCount} new</span>
          )}
        </button>
      </div>

      {filter === OPEN && openSymbol === null && (
        <p className="mb-1.5 text-[12px] text-secondary">No quote open: showing all symbols.</p>
      )}

      {rows.length === 0 ? (
        <p className="py-2 text-secondary">{target === null ? "Waiting for trades…" : `No trades for ${target} yet`}</p>
      ) : (
        // Focusable so the list can be scrolled from the keyboard; focus in it pauses the feed.
        <ol
          tabIndex={0}
          aria-label={target === null ? "Recent trades" : `Recent trades for ${target}`}
          onPointerEnter={() => setPointerInList(true)}
          onPointerLeave={() => setPointerInList(false)}
          onFocus={() => setFocusInList(true)}
          onBlur={onListBlur}
          className={`-mx-1 min-h-0 flex-1 overflow-y-auto rounded-md px-1 ${focusRing} focus-visible:outline-offset-0`}
        >
          {rows.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </aside>
  );
}

const FeedRow = memo(function FeedRow({ item }: { item: FeedEvent }): JSX.Element {
  const buy = item.side === "buy";
  return (
    <li className="flex animate-feed-in items-center justify-between gap-2 border-b border-subtle py-2 motion-reduce:animate-none">
      <span className="flex min-w-0 items-center gap-2">
        <span className="rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-[12px]">{item.symbol}</span>
        <span className="truncate font-mono">
          {formatQuantity(item.quantity)} @ {formatPrice(item.price)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {/* Same colours as the cards: positive for buy, negative for sell. */}
        <span
          className={
            "inline-flex size-5 items-center justify-center rounded-full text-[12px] font-bold text-inverse " +
            (buy ? "bg-positive" : "bg-negative")
          }
        >
          <span aria-hidden="true">{buy ? "B" : "S"}</span>
          <span className="sr-only">{buy ? "buy" : "sell"}</span>
        </span>
        <time dateTime={new Date(item.timestamp).toISOString()} className="font-mono text-[12px] text-secondary">
          {formatClockTime(item.timestamp)}
        </time>
      </span>
    </li>
  );
});
