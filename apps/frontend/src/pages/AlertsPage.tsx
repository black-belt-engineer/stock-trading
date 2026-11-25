import { useLayoutEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Link } from "react-router";
import type { PriceAlert } from "../alerts/alertsApi";
import { alertCondition, CHECKED_WHILE_OPEN, firedAtText, formatDateTime } from "../alerts/alertText";
import { useAlerts } from "../alerts/AlertsProvider";
import { NotifyToggle } from "../alerts/NotifyToggle";
import { centsOf, conditionMet, priceToCents } from "../alerts/money";
import { buttonClass, focusRing, panelClass } from "../components/pageStyles";
import { useStreamData } from "../stream/StreamProvider";
import { formatPrice } from "../utils/format";

/** Same as the server's cap (`ACTIVE_ALERT_LIMIT` in apps/portfolio). Shown, not enforced, here. */
const ACTIVE_LIMIT = 50;

const smallButton = `${buttonClass} h-7 px-2.5 text-[13px]`;
const rowClass = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-subtle bg-elevated px-3 py-2";
const linkClass = `rounded-sm text-brand underline underline-offset-2 ${focusRing}`;

function quoteLink(symbol: string): string {
  return `/?symbol=${encodeURIComponent(symbol)}`;
}

/** Whether the alert would fire on this price at once. */
function alreadyMet(alert: PriceAlert, price: number | null): boolean {
  const threshold = centsOf(alert.threshold);
  return price !== null && threshold !== null && conditionMet(alert.direction, threshold, priceToCents(price));
}

/**
 * `/alerts` (P2, owner's decision): active alerts with Delete, and the triggered ones (history)
 * with Re-arm and Delete. Re-arm creates a new alert with the same values (owner's decision),
 * so the history entry stays; like the dialog's form it warns first when the price is already
 * past the threshold. Alerts are created from the quote dialog.
 */
export function AlertsPage(): JSX.Element {
  const { active, history, status, create, remove } = useAlerts();
  const { stocks } = useStreamData();
  const prices = new Map(stocks.map((s) => [s.symbol, s.currentPrice]));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rearming, setRearming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // A deleted row takes its button with it: move focus to the next row's button, or the heading.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const next = document.querySelector<HTMLElement>(`[data-alert-action="${CSS.escape(target)}"]`);
    (next ?? headingRef.current)?.focus();
  });

  const onDelete = (list: readonly PriceAlert[], index: number): void => {
    const alert = list[index];
    if (!alert) return;
    const neighbour = list[index + 1] ?? list[index - 1];
    pendingFocus.current = neighbour ? `delete-${neighbour.id}` : "none";
    setMessage(null);
    remove(alert.id);
  };

  const onRearm = async (alert: PriceAlert): Promise<void> => {
    if (rearming !== null) return;
    if (confirming !== alert.id && alreadyMet(alert, prices.get(alert.symbol) ?? null)) {
      setConfirming(alert.id);
      return;
    }
    setConfirming(null);
    setRearming(alert.id);
    setMessage(null);
    const result = await create({ symbol: alert.symbol, direction: alert.direction, threshold: alert.threshold });
    setRearming(null);
    if (result.ok) setMessage({ text: `Re-armed: ${alert.symbol} ${alertCondition(alert)}.`, tone: "ok" });
    else if (result.reason !== "loggedOut") setMessage({ text: result.message, tone: "error" });
  };

  return (
    <div className="grid max-w-[760px] gap-4">
      <header className="grid gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="text-[20px] font-semibold outline-none">
          Alerts
        </h1>
        <p className="text-secondary">
          {CHECKED_WHILE_OPEN} When none of its tabs is open, nothing is checked and no alert fires. To add one, open a
          quote on the{" "}
          <Link to="/" className={linkClass}>
            Quotes
          </Link>{" "}
          page.
        </p>
        <NotifyToggle />
      </header>

      <p role="status" className={message ? `text-[13px] ${message.tone === "ok" ? "text-positive" : "text-negative"}` : "sr-only"}>
        {message?.text ?? ""}
      </p>

      <section aria-labelledby="alerts-active" className="grid gap-2">
        <h2 id="alerts-active" className="text-[15px] font-semibold">
          Active <span className="font-normal text-secondary">({active.length} of {ACTIVE_LIMIT})</span>
        </h2>
        {status === "loading" && <p className={panelClass}>Loading your alerts…</p>}
        {status !== "loading" && active.length === 0 && (
          <p className={panelClass}>
            No active alerts. Open a quote and use <span className="text-primary">Set alert</span> to add one.
          </p>
        )}
        {active.length > 0 && (
          <ul className="grid gap-2">
            {active.map((alert, index) => {
              const price = prices.get(alert.symbol) ?? null;
              return (
                <li key={alert.id} className={`${rowClass} ${alert.listed ? "" : "text-secondary"}`}>
                  <span className="min-w-0 flex-1">
                    {alert.listed ? (
                      <Link to={quoteLink(alert.symbol)} className={`font-mono font-semibold ${linkClass} no-underline`}>
                        {alert.symbol}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold">{alert.symbol}</span>
                    )}{" "}
                    <span className="font-mono">{alertCondition(alert)}</span>
                    <span className="block text-[13px] text-secondary">
                      {alert.listed ? `Now ${formatPrice(price)} · set ${formatDateTime(alert.createdAt)}` : "No longer listed: it cannot fire"}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-alert-action={`delete-${alert.id}`}
                    onClick={() => onDelete(active, index)}
                    aria-label={`Delete alert ${alert.symbol} ${alertCondition(alert)}`}
                    className={smallButton}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="alerts-history" className="grid gap-2">
        <h2 id="alerts-history" className="text-[15px] font-semibold">
          Triggered
        </h2>
        {status !== "loading" && history.length === 0 && <p className={panelClass}>No alert has fired yet.</p>}
        {history.length > 0 && (
          <ul className="grid gap-2">
            {history.map((alert, index) => {
              const asking = confirming === alert.id;
              return (
                <li key={alert.id} className={rowClass}>
                  <span className="min-w-0 flex-1">
                    <span className="font-mono font-semibold">{alert.symbol}</span>{" "}
                    <span className="font-mono">{alertCondition(alert)}</span>
                    <span className="block text-[13px] text-secondary">{firedAtText(alert)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {alert.listed && (
                      <button
                        type="button"
                        onClick={() => void onRearm(alert)}
                        disabled={rearming !== null}
                        aria-label={`${asking ? "Re-arm anyway" : "Re-arm"} ${alert.symbol} ${alertCondition(alert)}`}
                        aria-describedby={asking ? `rearm-warning-${alert.id}` : undefined}
                        className={smallButton}
                      >
                        {rearming === alert.id ? "Saving…" : asking ? "Re-arm anyway" : "Re-arm"}
                      </button>
                    )}
                    <button
                      type="button"
                      data-alert-action={`delete-${alert.id}`}
                      onClick={() => onDelete(history, index)}
                      aria-label={`Delete triggered alert ${alert.symbol} ${alertCondition(alert)}`}
                      className={smallButton}
                    >
                      Delete
                    </button>
                  </span>
                  {asking && (
                    <p id={`rearm-warning-${alert.id}`} role="alert" className="basis-full text-[13px] text-warning">
                      {alert.symbol} is at {formatPrice(prices.get(alert.symbol) ?? null)}, already {alertCondition(alert)}: a
                      re-armed alert would fire right away.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
