import type { JSX } from "react";
import { buttonClass } from "../components/pageStyles";
import { useWatchlist } from "./WatchlistProvider";

/**
 * Says when a star change was refused (and rolled back), or when the watchlist cannot be
 * reached and the stars are read-only. A polite live region that is always in the page, inside
 * `main`, so screen readers announce what appears in it.
 */
export function WatchlistNotice(): JSX.Element {
  const { status, notice, dismissNotice, retry } = useWatchlist();
  const unavailable = status === "unavailable";
  const show = notice !== null || unavailable;
  return (
    <div role="status" className={show ? "" : "sr-only"}>
      {show && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-warning/40 bg-surface px-4 py-2.5 text-[13px]">
          <p className="min-w-0 flex-1 text-primary">
            {notice ?? "Your watchlist is unavailable right now. Stars are read-only until it is back."}
          </p>
          {unavailable && (
            <button type="button" onClick={retry} className={buttonClass}>
              Retry
            </button>
          )}
          {notice !== null && (
            <button type="button" onClick={dismissNotice} className={buttonClass}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
