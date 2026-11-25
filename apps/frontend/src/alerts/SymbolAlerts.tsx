import { useId, useRef, useState } from "react";
import type { FormEvent, JSX } from "react";
import { Link } from "react-router";
import { PillGroup } from "../components/PillGroup";
import { buttonClass, focusRing } from "../components/pageStyles";
import { formatPrice } from "../utils/format";
import type { AlertDirection } from "./alertsApi";
import { alertCondition, CHECKED_WHILE_OPEN } from "./alertText";
import { useAlerts } from "./AlertsProvider";
import { NotifyToggle } from "./NotifyToggle";
import { conditionMet, formatCents, formatCentsAsPrice, parseThresholdInput, priceToCents } from "./money";

const DIRECTIONS = [
  { id: "above", label: "At or above" },
  { id: "below", label: "At or below" },
];

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-default bg-input px-2.5 font-mono text-[14px] text-primary " +
  `hover:border-strong aria-invalid:border-negative ${focusRing}`;

const smallButton = `${buttonClass} h-7 px-2.5 text-[13px]`;

function isDirection(value: string): value is AlertDirection {
  return value === "above" || value === "below";
}

/** The price field's starting text: the current price, or empty before the first trade. */
function prefill(price: number | null): string {
  return price === null ? "" : formatCents(priceToCents(price));
}

/**
 * The quote dialog's alert section (P2 step 5): create an alert for this symbol, and the
 * symbol's active alerts with Delete. Mount it with `key={symbol}` so a new symbol starts a
 * fresh form.
 *
 * A threshold the price is already at or past would fire at once, so the first submit only
 * warns and the button becomes "Create anyway". Changing the direction or the price clears that.
 */
export function SymbolAlerts({ symbol, currentPrice }: { symbol: string; currentPrice: number | null }): JSX.Element {
  const { active, status, notice, create, remove } = useAlerts();
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [priceText, setPriceText] = useState(() => prefill(currentPrice));
  const [error, setError] = useState<string | null>(null);
  const [confirmPast, setConfirmPast] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const mine = active.filter((alert) => alert.symbol === symbol);

  const edited = (): void => {
    setError(null);
    setConfirmPast(false);
    setDone(null);
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    const parsed = parseThresholdInput(priceText);
    if (!parsed.ok) {
      setError(parsed.message);
      inputRef.current?.focus();
      return;
    }
    if (
      !confirmPast &&
      currentPrice !== null &&
      conditionMet(direction, parsed.cents, priceToCents(currentPrice))
    ) {
      setConfirmPast(true);
      return;
    }
    setSubmitting(true);
    setDone(null);
    const result = await create({ symbol, direction, threshold: formatCents(parsed.cents) });
    setSubmitting(false);
    setConfirmPast(false);
    if (result.ok) {
      setDone(`Alert set: ${symbol} ${alertCondition(result.alert)}.`);
      setPriceText(prefill(currentPrice));
      return;
    }
    if (result.reason === "loggedOut") return;
    setError(result.message);
  };

  const parsed = parseThresholdInput(priceText);
  const thresholdText = parsed.ok ? formatCentsAsPrice(parsed.cents) : "";
  const errorId = `${ids}-error`;
  const warningId = `${ids}-warning`;

  return (
    <section aria-labelledby={`${ids}-title`} className="grid gap-3 border-t border-subtle px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${ids}-title`} className="text-[14px] font-semibold">
          Price alert
        </h3>
        <Link to="/alerts" className={`rounded-sm text-[13px] text-brand underline underline-offset-2 ${focusRing}`}>
          All alerts
        </Link>
      </div>

      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-3">
        <PillGroup
          label="Alert when the price is"
          pills={DIRECTIONS}
          value={direction}
          onChange={(value) => {
            if (!isDirection(value)) return;
            setDirection(value);
            edited();
          }}
        />
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-[13px] text-secondary">
            Price (USD)
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={priceText}
              onChange={(event) => {
                setPriceText(event.target.value);
                edited();
              }}
              aria-invalid={error !== null}
              aria-describedby={[error ? errorId : "", confirmPast ? warningId : ""].filter(Boolean).join(" ") || undefined}
              className={fieldClass}
            />
          </label>
          <button type="submit" disabled={submitting} className={`${buttonClass} h-9 shrink-0`}>
            {submitting ? "Saving…" : confirmPast ? "Create anyway" : "Set alert"}
          </button>
        </div>
        <p className="text-[13px] text-secondary">
          Now {formatPrice(currentPrice)}. {CHECKED_WHILE_OPEN}
        </p>
        {error !== null && (
          <p id={errorId} role="alert" className="text-[13px] text-negative">
            {error}
          </p>
        )}
        {confirmPast && currentPrice !== null && (
          <p id={warningId} role="alert" className="rounded-md border border-warning/40 px-3 py-2 text-[13px] text-primary">
            {symbol} is already at {formatPrice(currentPrice)}, {direction === "above" ? "at or above" : "at or below"}{" "}
            {thresholdText}. The alert would fire right away. Select Create anyway to set it, or change the price.
          </p>
        )}
        <NotifyToggle />
      </form>

      <p role="status" className={done ? "text-[13px] text-positive" : "sr-only"}>
        {done ?? ""}
      </p>
      {notice !== null && <p className="text-[13px] text-warning">{notice}</p>}
      {status === "unavailable" && (
        <p className="text-[13px] text-warning">Alerts cannot be reached right now; changes may not be saved.</p>
      )}

      {mine.length > 0 && (
        <ul aria-label={`Active ${symbol} alerts`} className="grid gap-1.5">
          {mine.map((alert) => (
            <li key={alert.id} className="flex items-center justify-between gap-3 rounded-md bg-elevated px-3 py-1.5 text-[13px]">
              <span className="font-mono">{alertCondition(alert)}</span>
              <button
                type="button"
                onClick={() => remove(alert.id)}
                aria-label={`Delete alert ${symbol} ${alertCondition(alert)}`}
                className={smallButton}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
