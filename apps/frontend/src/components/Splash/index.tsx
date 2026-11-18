import { useEffect, useState } from "react";
import type { JSX } from "react";
import { buttonClass } from "../pageStyles";

/** The spinner waits this long, so a fast startup refresh shows only the name. */
const SPINNER_DELAY_MS = 300;

type Props = {
  /** `GET /bff/me` could not tell whether there is a session. */
  unavailable?: boolean;
  onRetry?: () => void;
};

/**
 * Shown while `GET /bff/me` decides whether there is a session (and while the browser
 * leaves for the login), so a reload never flashes a page that is about to go. Under reduced motion the spinner is a still ring.
 */
export function Splash({ unavailable = false, onRetry }: Props): JSX.Element {
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-base px-4 text-center">
      <h1 className="font-bold tracking-[0.08em] text-brand">STREAMTICK</h1>
      {unavailable ? (
        <section role="alert" className="grid justify-items-center gap-3 text-secondary">
          <p>Service unavailable, try again.</p>
          <button type="button" onClick={onRetry} className={buttonClass}>
            Try again
          </button>
        </section>
      ) : (
        <div role="status" className="grid size-6 place-items-center">
          <span className="sr-only">Loading</span>
          {showSpinner && (
            <span
              aria-hidden="true"
              className="size-5 rounded-full border-2 border-default border-t-brand motion-safe:animate-spin"
            />
          )}
        </div>
      )}
    </main>
  );
}
