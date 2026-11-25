import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { useQuoteViewState } from "../../hooks/useQuoteView";
import type { QuoteViewState } from "../../hooks/useQuoteView";

type ShellControlsValue = QuoteViewState & {
  /** The feed's Pause button (D2). Hover and focus pauses stay inside the feed. */
  feedPaused: boolean;
  setFeedPaused: (paused: boolean) => void;
  toggleFeedPaused: () => void;
};

const ShellControlsContext = createContext<ShellControlsValue | null>(null);

/**
 * State that more than one part of the shell changes: the feed's pause (its
 * button and the `p` shortcut) and the quotes view (the page's toggle, the `v`
 * shortcut and Settings). It changes only on a user action, never on a tick.
 */
export function ShellControlsProvider({ children }: { children: ReactNode }): JSX.Element {
  const { view, preference, setPreference } = useQuoteViewState();
  const [feedPaused, setFeedPaused] = useState(false);
  const toggleFeedPaused = useCallback(() => setFeedPaused((p) => !p), []);

  const value = useMemo(
    () => ({ view, preference, setPreference, feedPaused, setFeedPaused, toggleFeedPaused }),
    [view, preference, setPreference, feedPaused, toggleFeedPaused],
  );
  return <ShellControlsContext.Provider value={value}>{children}</ShellControlsContext.Provider>;
}

export function useShellControls(): ShellControlsValue {
  const value = useContext(ShellControlsContext);
  if (!value) throw new Error("useShellControls needs a ShellControlsProvider");
  return value;
}
