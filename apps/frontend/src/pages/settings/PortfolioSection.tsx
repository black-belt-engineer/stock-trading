import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { buttonClass } from "../../components/pageStyles";
import { formatMoney } from "../../portfolio/money";
import { usePortfolio } from "../../portfolio/PortfolioProvider";
import { SettingsSection } from "./fields";

const dangerButton = `${buttonClass} h-10 border-negative/60! text-negative!`;

/**
 * Settings → Portfolio (P3 step 10): start the paper-trading account over. The first button
 * only asks; the second resets: positions and order history are deleted and the cash goes back
 * to the starting amount.
 */
export function PortfolioSection(): JSX.Element {
  const { account, reset } = usePortfolio();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // Set when the question closes, so focus goes back to the button that opened it.
  const refocus = useRef(false);
  const starting = account ? formatMoney(account.startingCash) : "$100,000.00";

  useEffect(() => {
    if (asking) confirmRef.current?.focus();
    else if (refocus.current) startRef.current?.focus();
    refocus.current = false;
  }, [asking]);

  const onReset = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await reset();
      setMessage({ text: `Portfolio reset: ${starting} in cash, no positions, no orders.`, ok: true });
    } catch {
      setMessage({ text: "The portfolio could not be reset. Nothing was changed; try again.", ok: false });
    } finally {
      setBusy(false);
      refocus.current = true;
      setAsking(false);
    }
  };

  return (
    <SettingsSection id="settings-portfolio" title="Portfolio">
      <p className="text-secondary">
        Start paper trading over with {starting} in cash. Your positions and order history are deleted.
      </p>
      {!asking ? (
        <button ref={startRef} type="button" onClick={() => setAsking(true)} className={`${dangerButton} justify-self-start`}>
          Reset portfolio
        </button>
      ) : (
        <div role="group" aria-labelledby="portfolio-reset-question" className="grid gap-3 rounded-md border border-negative/40 p-3">
          <p id="portfolio-reset-question" className="text-primary">
            Reset your portfolio? This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button ref={confirmRef} type="button" onClick={() => void onReset()} disabled={busy} className={dangerButton}>
              {busy ? "Resetting…" : "Yes, reset"}
            </button>
            <button
              type="button"
              onClick={() => {
                refocus.current = true;
                setAsking(false);
              }}
              disabled={busy}
              className={`${buttonClass} h-10`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p role="status" className={message ? `text-[13px] ${message.ok ? "text-positive" : "text-negative"}` : "sr-only"}>
        {message?.text ?? ""}
      </p>
    </SettingsSection>
  );
}
