import { useCallback, useState } from "react";

export type QuoteView = "cards" | "table";

/** The stored preference: a view, or "auto" (no stored choice) for the width-based default. */
export type QuoteViewPreference = QuoteView | "auto";

/** Where the choice is kept: a display preference of this browser, not personal data. */
export const VIEW_STORAGE_KEY = "streamtick.quotes.view";

/** Below Tailwind's `md`, where a long card grid is mostly scrolling, the table is the default (U2). */
const NARROW_QUERY = "(max-width: 47.99rem)";

export function isQuoteView(value: unknown): value is QuoteView {
  return value === "cards" || value === "table";
}

export function isQuoteViewPreference(value: unknown): value is QuoteViewPreference {
  return value === "auto" || isQuoteView(value);
}

/** The stored choice, or "auto" when there is none or storage is unavailable (private mode, blocked). */
export function readViewPreference(): QuoteViewPreference {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isQuoteView(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Stores the choice; "auto" removes the key. Settings' default view and the page's toggle share it. */
export function storeViewPreference(preference: QuoteViewPreference): void {
  try {
    if (preference === "auto") window.localStorage.removeItem(VIEW_STORAGE_KEY);
    else window.localStorage.setItem(VIEW_STORAGE_KEY, preference);
  } catch {
    // Not remembered; the page still switches.
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
  const [view, setView] = useState<QuoteView>(() => {
    const stored = readViewPreference();
    return stored === "auto" ? defaultView() : stored;
  });

  const choose = useCallback((next: QuoteView) => {
    setView(next);
    storeViewPreference(next);
  }, []);

  return [view, choose];
}
