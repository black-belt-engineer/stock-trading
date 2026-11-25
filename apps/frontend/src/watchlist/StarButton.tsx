import type { JSX, MouseEvent } from "react";
import { focusRing } from "../components/pageStyles";
import { useWatchlist } from "./WatchlistProvider";

const STAR = "M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7z";

type Props = {
  symbol: string;
  /** `sm` for table rows (28px), `md` elsewhere (32px). Both are above the 24px target size. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * The watchlist star (P1): a toggle button with a fixed name and `aria-pressed`. It changes at
 * once; a refused change is rolled back and explained by the shell's notice. While the list is
 * loading or unavailable it stays focusable but does nothing, and its title says why.
 */
export function StarButton({ symbol, size = "md", className = "" }: Props): JSX.Element {
  const { starred, status, toggle } = useWatchlist();
  const on = starred.has(symbol);
  const ready = status === "ready";
  const title = ready
    ? on
      ? `Remove ${symbol} from your watchlist`
      : `Add ${symbol} to your watchlist`
    : status === "loading"
      ? "Loading your watchlist…"
      : "Watchlist unavailable: stars are read-only for now";

  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // A table row and a card's wrapper open the dialog on click; a star must not.
    event.stopPropagation();
    if (ready) toggle(symbol);
  };

  return (
    <button
      type="button"
      aria-label={`Watch ${symbol}`}
      aria-pressed={on}
      aria-disabled={!ready}
      title={title}
      onClick={onClick}
      className={
        `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 ${focusRing} ` +
        (size === "sm" ? "size-7 " : "size-8 ") +
        (on ? "text-brand " : "text-secondary hover:text-primary ") +
        (ready ? "" : "cursor-default opacity-60 ") +
        className
      }
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 20 20"
        className={size === "sm" ? "size-4" : "size-[18px]"}
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      >
        <path d={STAR} />
      </svg>
    </button>
  );
}
