import type { JSX } from "react";
import { Link } from "react-router";
import { buttonClass, focusRing } from "../components/pageStyles";
import { alertCondition, firedAtText } from "./alertText";
import { useAlerts } from "./AlertsProvider";

/** At most this many toasts at once; older ones are still in the bell and on the Alerts page. */
const MAX_TOASTS = 3;

/**
 * In-app notification of an alert this tab was first to trigger (P2 step 4). Toasts stay until
 * dismissed: one that appeared while the tab was hidden is still there when the user comes back,
 * and nothing disappears before it could be read.
 *
 * A labelled region with a polite live region inside, always in the page so screen readers
 * announce what is added. It sits outside `main` so it shows over every page and over the narrow
 * feed tab, which hides `main`.
 */
export function AlertToasts(): JSX.Element {
  const { toasts, dismissToast } = useAlerts();
  const shown = toasts.slice(0, MAX_TOASTS);
  return (
    <section
      aria-label="Alert notifications"
      className={
        "pointer-events-none fixed right-4 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 w-[min(360px,calc(100vw-32px))] " +
        "md:right-5 md:bottom-5"
      }
    >
      <div role="status" className="grid gap-2">
        {shown.map(({ alert }) => (
          <div
            key={alert.id}
            className="pointer-events-auto grid gap-2 rounded-[10px] border border-brand/60 bg-surface p-3.5 text-[13px] shadow-dialog"
          >
            <p className="text-primary">
              <span className="font-mono font-semibold">{alert.symbol}</span> {alertCondition(alert)}
              <span className="block text-secondary">{firedAtText(alert)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/?symbol=${encodeURIComponent(alert.symbol)}`}
                onClick={() => dismissToast(alert.id)}
                className={`${buttonClass} h-7 px-2.5 text-[13px]`}
              >
                Open {alert.symbol}
              </Link>
              <button
                type="button"
                onClick={() => dismissToast(alert.id)}
                aria-label={`Dismiss the ${alert.symbol} alert`}
                className={`${buttonClass} h-7 px-2.5 text-[13px]`}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
        {toasts.length > MAX_TOASTS && (
          <Link
            to="/alerts"
            className={`pointer-events-auto justify-self-end rounded-md bg-surface px-2 py-1 text-[13px] text-brand underline underline-offset-2 ${focusRing}`}
          >
            {toasts.length - MAX_TOASTS} more on the Alerts page
          </Link>
        )}
      </div>
    </section>
  );
}
