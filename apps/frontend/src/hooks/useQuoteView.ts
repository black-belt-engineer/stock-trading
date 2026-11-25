import { useCallback, useState } from "react";

export type QuoteView = "cards" | "table";

/** Where the choice is kept: a display preference of this browser, not personal data. */
export const VIEW_STORAGE_KEY = "streamtick.quotes.view";

/** Below Tailwind's `md`, where a long card grid is mostly scrolling, the table is the default (U2). */
const NARROW_QUERY = "(max-width: 47.99rem)";

export function isQuoteView(value: unknown): value is QuoteView {
  return value === "cards" || value === "table";
}

/** The stored choice, or null when there is none or storage is unavailable (private mode, blocked). */
function readStored(): QuoteView | null {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isQuoteView(value) ? value : null;
  } catch {
    return null;
  }
}

function defaultView(): QuoteView {
  return window.matchMedia(NARROW_QUERY).matches ? "table" : "cards";
}

/**
 * Cards or table (D3). An explicit choice is remembered in `localStorage` and
 * wins over the default; without one, phones get the table and wider screens
 * the cards. When storage fails the choice lasts until the page is left.
 */
export function useQuoteView(): [QuoteView, (view: QuoteView) => void] {
  const [view, setView] = useState<QuoteView>(() => readStored() ?? defaultView());

  const choose = useCallback((next: QuoteView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Not remembered; the page still switches.
    }
  }, []);

  return [view, choose];
}
