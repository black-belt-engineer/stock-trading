import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, JSX } from "react";
import { Link } from "react-router";
import { PillGroup } from "../components/PillGroup";
import { buttonClass, focusRing } from "../components/pageStyles";
import { centsFromPrice, formatMoney, formatPrice4 } from "./money";
import { MAX_ORDER_QUANTITY } from "./portfolioApi";
import type { Order, Side } from "./portfolioApi";
import { usePortfolio } from "./PortfolioProvider";

const SIDES = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
];

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-default bg-input px-2.5 font-mono text-[14px] text-primary " +
  `hover:border-strong aria-invalid:border-negative ${focusRing}`;
const primaryButton = `${buttonClass} h-9 shrink-0 border-brand! bg-brand-dim! text-brand!`;

function isSide(value: string): value is Side {
  return value === "buy" || value === "sell";
}

/** A new id for one submission; a retry of the same submission reuses it. */
function newClientOrderId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Not a secure context (plain http on another host): build a v4 UUID by hand.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type QuantityInput = { ok: true; quantity: number } | { ok: false; message: string };

/** Whole shares, 1 to 10,000. Spaces and thousands commas are allowed ("1,000"). */
export function parseQuantityInput(raw: string): QuantityInput {
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "") return { ok: false, message: "Enter a number of shares" };
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: "Enter whole shares, like 10" };
  const quantity = Number(cleaned);
  if (quantity < 1) return { ok: false, message: "Enter at least 1 share" };
  if (quantity > MAX_ORDER_QUANTITY) return { ok: false, message: `At most ${MAX_ORDER_QUANTITY.toLocaleString("en-US")} shares per order` };
  return { ok: true, quantity };
}

type Step =
  | { kind: "edit" }
  /** The confirm step. `clientOrderId` is kept until the order fills or is changed, so a retry cannot run twice. */
  | { kind: "review"; side: Side; quantity: number; clientOrderId: string; sending: boolean }
  | { kind: "done"; order: Order; replayed: boolean };

function verb(side: Side, past = false): string {
  if (past) return side === "buy" ? "Bought" : "Sold";
  return side === "buy" ? "Buy" : "Sell";
}

/**
 * The quote dialog's trade ticket (P3 step 9): side, quantity, an estimated cost, a confirm step,
 * then the actual fill. Market orders fill at the server's latest price, so the figure shown
 * before confirming is labelled an estimate. Mount with `key={symbol}`.
 */
export function TradeTicket({ symbol, currentPrice }: { symbol: string; currentPrice: number | null }): JSX.Element {
  const { account, status, placeOrder } = usePortfolio();
  const [side, setSide] = useState<Side>("buy");
  const [quantityText, setQuantityText] = useState("1");
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const ids = useId();
  // Set by Back, so focus returns to the quantity once the form is shown again.
  const backToForm = useRef(false);

  const held = account?.positions.find((p) => p.symbol === symbol)?.quantity ?? 0;
  const priceCents = centsFromPrice(currentPrice);
  const parsed = parseQuantityInput(quantityText);
  const quantity = step.kind === "review" ? step.quantity : parsed.ok ? parsed.quantity : null;
  const shownSide = step.kind === "review" ? step.side : side;
  const estimate = priceCents !== null && quantity !== null ? priceCents * BigInt(quantity) : null;

  // Focus follows the step: Confirm on review, the result once filled.
  useEffect(() => {
    if (step.kind === "review" && !step.sending) confirmRef.current?.focus();
    if (step.kind === "done") resultRef.current?.focus();
    if (step.kind === "edit" && backToForm.current) inputRef.current?.focus();
    backToForm.current = false;
  }, [step]);

  const edited = (): void => {
    setError(null);
    if (step.kind === "done") setStep({ kind: "edit" });
  };

  const onReview = (event: FormEvent): void => {
    event.preventDefault();
    if (!parsed.ok) {
      setError(parsed.message);
      inputRef.current?.focus();
      return;
    }
    if (side === "sell" && parsed.quantity > held) {
      setError(held === 0 ? `You hold no ${symbol} shares.` : `You hold ${held.toLocaleString("en-US")} ${symbol} shares.`);
      inputRef.current?.focus();
      return;
    }
    if (side === "buy" && account && estimate !== null && estimate > account.cash) {
      setError(`Not enough cash: this needs about ${formatMoney(estimate)}, you have ${formatMoney(account.cash)}.`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setStep({ kind: "review", side, quantity: parsed.quantity, clientOrderId: newClientOrderId(), sending: false });
  };

  const onConfirm = async (): Promise<void> => {
    if (step.kind !== "review" || step.sending) return;
    const pending = { ...step, sending: true };
    setStep(pending);
    setError(null);
    const result = await placeOrder({ symbol, side: pending.side, quantity: pending.quantity, clientOrderId: pending.clientOrderId });
    if (result.kind === "filled") {
      setStep({ kind: "done", order: result.order, replayed: result.replayed });
      setQuantityText("1");
      return;
    }
    if (result.kind === "loggedOut") return;
    if (result.kind === "refused") {
      // Nothing ran: back to editing, and the next attempt is a new submission with a new id.
      setStep({ kind: "edit" });
      setError(result.message);
      return;
    }
    // No answer even after one retry: stay on Confirm with the same id, which makes another
    // attempt safe.
    setStep({ ...pending, sending: false });
    setError(`${result.message} Try again: the order will not run twice.`);
  };

  const errorId = `${ids}-error`;
  const disabled = status !== "ready" || priceCents === null;

  return (
    <section aria-labelledby={`${ids}-title`} className="grid gap-3 border-t border-subtle px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${ids}-title`} className="text-[14px] font-semibold">
          Trade
        </h3>
        <Link to="/portfolio" className={`rounded-sm text-[13px] text-brand underline underline-offset-2 ${focusRing}`}>
          Portfolio
        </Link>
      </div>

      {step.kind !== "review" ? (
        <form onSubmit={onReview} noValidate className="grid gap-3">
          <PillGroup
            label="Order side"
            pills={SIDES}
            value={side}
            onChange={(value) => {
              if (!isSide(value)) return;
              setSide(value);
              edited();
            }}
          />
          <div className="flex items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-[13px] text-secondary">
              Shares
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={quantityText}
                onChange={(event) => {
                  setQuantityText(event.target.value);
                  edited();
                }}
                aria-invalid={error !== null}
                aria-describedby={error !== null ? errorId : undefined}
                className={fieldClass}
              />
            </label>
            <button type="submit" disabled={disabled} className={`${buttonClass} h-9 shrink-0`}>
              Review order
            </button>
          </div>
          <p className="text-[13px] text-secondary">
            {estimate !== null
              ? `Estimated ${side === "buy" ? "cost" : "proceeds"} ${formatMoney(estimate)}. `
              : priceCents === null
                ? "No price yet, so no order can be placed. "
                : ""}
            {status === "ready" && account
              ? side === "buy"
                ? `Cash ${formatMoney(account.cash)}.`
                : `You hold ${held.toLocaleString("en-US")}.`
              : status === "error"
                ? "Your account cannot be loaded right now."
                : "Loading your account…"}
          </p>
        </form>
      ) : (
        <div className="grid gap-3">
          <p id={`${ids}-review`} className="rounded-md bg-elevated px-3 py-2 text-[14px]">
            {verb(step.side)} <span className="font-mono">{step.quantity.toLocaleString("en-US")}</span> {symbol} at market.
            Estimated {step.side === "buy" ? "cost" : "proceeds"}{" "}
            <span className="font-mono">{estimate !== null ? formatMoney(estimate) : "—"}</span>
            <span className="block text-[13px] text-secondary">
              The order fills at the latest price when it reaches the server, which may differ from this estimate.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void onConfirm()}
              disabled={step.sending}
              aria-describedby={[`${ids}-review`, error !== null ? errorId : ""].filter(Boolean).join(" ")}
              className={primaryButton}
            >
              {step.sending ? "Placing…" : `Confirm ${verb(step.side).toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => {
                backToForm.current = true;
                setStep({ kind: "edit" });
                setError(null);
              }}
              disabled={step.sending}
              className={`${buttonClass} h-9`}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <p id={errorId} role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
      <p
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className={step.kind === "done" ? "rounded-md border border-positive/40 px-3 py-2 text-[13px] text-primary outline-none" : "sr-only"}
      >
        {step.kind === "done"
          ? `${verb(step.order.side, true)} ${step.order.quantity.toLocaleString("en-US")} ${step.order.symbol} at ${formatPrice4(step.order.price)}, total ${formatMoney(step.order.total)}.${step.replayed ? " (This order had already been placed.)" : ""}`
          : ""}
      </p>
    </section>
  );
}
