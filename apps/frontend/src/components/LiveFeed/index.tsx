import { useEffect, useRef } from "react";
import type { FeedEvent } from "../../types";
import type { JSX, KeyboardEvent } from "react";
import { formatPrice } from "../../utils/format";

type Props = {
  feed: FeedEvent[];
  /** Feed tab selected (narrow) or drawer open (medium). Wide screens always show the feed. */
  open: boolean;
  /** Closes the medium-width drawer. */
  onClose: () => void;
};

/** Matches the medium layout, where the feed is a drawer: Tailwind's md up to xl. */
const DRAWER_QUERY = "(min-width: 48rem) and (not (min-width: 80rem))";

export function LiveFeed({ feed, open, onClose }: Props): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);

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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-normal tracking-widest text-secondary uppercase">Live Feed</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close live feed"
          className={
            "hidden size-8 cursor-pointer items-center justify-center rounded-md text-[22px] leading-none text-secondary " +
            "transition-colors duration-150 hover:text-primary md:max-xl:inline-flex " +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          }
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feed.length === 0 && <div className="py-2 text-secondary">Waiting for trades…</div>}
        {feed.map((item) => (
          <div key={item.id} className="animate-feed-in border-b border-subtle py-2 motion-reduce:animate-none">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center">
                <span className="rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-[12px]">{item.symbol}</span>
                <span className="ml-2 font-mono">{formatPrice(item.price)}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Same colours as the cards: positive for buy, negative for sell. */}
                <span
                  className={
                    "inline-flex size-5 items-center justify-center rounded-full text-[12px] font-bold text-inverse " +
                    (item.side === "buy" ? "bg-positive" : "bg-negative")
                  }
                >
                  {item.side === "buy" ? "B" : "S"}
                </span>
                <span className="text-[12px] text-muted">{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
