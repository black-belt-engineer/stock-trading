import type { JSX } from "react";
import { buttonClass } from "../components/pageStyles";
import { useAlerts } from "./AlertsProvider";

/**
 * Says when a delete was refused (and rolled back), or when the alerts cannot be loaded. The
 * second matters on every page: with no list, nothing is being checked. Same pattern as
 * `WatchlistNotice`: a polite live region always in the page, inside `main`.
 */
export function AlertsNotice(): JSX.Element {
  const { status, notice, active, dismissNotice, retry } = useAlerts();
  const unavailable = status === "unavailable";
  const show = notice !== null || unavailable;
  const unavailableText =
    active.length > 0
      ? "Your alerts cannot be reached right now. The ones already loaded are still checked; changes may not be saved."
      : "Your alerts could not be loaded, so none are being checked.";
  return (
    <div role="status" className={show ? "" : "sr-only"}>
      {show && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-warning/40 bg-surface px-4 py-2.5 text-[13px]">
          <p className="min-w-0 flex-1 text-primary">{notice ?? unavailableText}</p>
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
