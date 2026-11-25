import { useCallback, useState, useSyncExternalStore } from "react";

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
function readViewPreference(): QuoteViewPreference {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isQuoteView(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Stores the choice; "auto" removes the key. */
function storeViewPreference(preference: QuoteViewPreference): void {
  try {
    if (preference === "auto") window.localStorage.removeItem(VIEW_STORAGE_KEY);
    else window.localStorage.setItem(VIEW_STORAGE_KEY, preference);
  } catch {
    // Not remembered; the page still switches.
  }
}

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isNarrow = (): boolean => window.matchMedia(NARROW_QUERY).matches;

export type QuoteViewState = {
  /** What the quotes page shows. */
  view: QuoteView;
  /** What is stored: Settings shows "auto" as "Automatic". */
  preference: QuoteViewPreference;
  setPreference: (preference: QuoteViewPreference) => void;
};

/**
 * Cards or table (D3). An explicit choice is remembered in `localStorage` and
 * wins over the default; without one ("auto"), phones get the table and wider
 * screens the cards. When storage fails the choice lasts until the page is left.
 *
 * Called once, by the shell (`ShellControls`), so the quotes page's toggle, the
 * `v` shortcut and Settings' default view all change the same state.
 */
export function useQuoteViewState(): QuoteViewState {
  const [preference, setPreferenceState] = useState<QuoteViewPreference>(readViewPreference);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);
  const view: QuoteView = preference === "auto" ? (narrow ? "table" : "cards") : preference;

  const setPreference = useCallback((next: QuoteViewPreference) => {
    setPreferenceState(next);
    storeViewPreference(next);
  }, []);

  return { view, preference, setPreference };
}
