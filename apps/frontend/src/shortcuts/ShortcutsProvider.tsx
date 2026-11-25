import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate } from "react-router";
import { useShellControls } from "../components/AppShell/ShellControls";
import { focusRing } from "../components/pageStyles";
import { ARROW_DIRECTIONS, keyLabel, matchKey, spokenKey, neighbourIndex, SEQUENCE_TIMEOUT_MS, SHORTCUT_GROUPS, SHORTCUTS } from "./shortcuts";
import type { ShortcutAction } from "./shortcuts";

/** "off" turns character-key shortcuts off; no key means on. */
export const SHORTCUTS_STORAGE_KEY = "streamtick.shortcuts";

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function storeEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    else window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, "off");
  } catch {
    // Not remembered; the setting holds until the page is left.
  }
}

/** What only the quotes page can do. Registered while it is mounted. */
export type QuotesShortcuts = {
  focusSearch: () => void;
  /** Clears the search; false when there was nothing to clear. */
  clearSearch: () => boolean;
};

type ShortcutsContextValue = {
  /** Character-key shortcuts on (the Preferences setting). */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  openHelp: () => void;
  registerQuotes: (actions: QuotesShortcuts | null) => void;
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

const SYMBOL_BUTTONS = "main button[data-symbol]";

/** Typing goes to the field: text inputs, text areas, selects and editable content. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(target.type);
  }
  return false;
}

/** A Radix dialog or menu handles its own keys (Escape included); the shortcuts stay out of the way. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/** Moves focus from a card or table row to its neighbour on screen; false when it did not move. */
function moveFocus(key: string): boolean {
  const direction = ARROW_DIRECTIONS[key];
  const active = document.activeElement;
  if (!direction || !(active instanceof HTMLElement) || !active.matches(SYMBOL_BUTTONS)) return false;
  const buttons = [...document.querySelectorAll<HTMLElement>(SYMBOL_BUTTONS)].filter((b) => b.getClientRects().length > 0);
  const boxes = buttons.map((b) => {
    // A table row's button is only the symbol cell; its row is what is laid out on screen.
    const r = (b.closest("tr") ?? b).getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const next = buttons[neighbourIndex(boxes, buttons.indexOf(active), direction)];
  if (!next) return false;
  next.focus();
  return true;
}

/**
 * The one keyboard handler (D5) and the help dialog. Sits inside the shell, so it
 * can navigate, pause the feed and switch the view; the quotes page adds search.
 */
export function ShortcutsProvider({ children, onNavigate }: { children: ReactNode; onNavigate: () => void }): JSX.Element {
  const navigate = useNavigate();
  const { toggleFeedPaused, feedPaused, view, setPreference } = useShellControls();
  const [enabled, setEnabledState] = useState(readEnabled);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const quotesRef = useRef<QuotesShortcuts | null>(null);
  const helpOpenerRef = useRef<HTMLElement | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    storeEnabled(next);
  }, []);

  const openHelp = useCallback(() => {
    const active = document.activeElement;
    helpOpenerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setHelpOpen(true);
  }, []);

  const registerQuotes = useCallback((actions: QuotesShortcuts | null) => {
    quotesRef.current = actions;
  }, []);

  // The handler reads the latest state through a ref, so the listener is added once.
  const latest = useRef({ enabled, feedPaused, view, toggleFeedPaused, setPreference, navigate, onNavigate, openHelp });
  useEffect(() => {
    latest.current = { enabled, feedPaused, view, toggleFeedPaused, setPreference, navigate, onNavigate, openHelp };
  });

  useEffect(() => {
    let pending: string | null = null;
    let pendingTimer = 0;
    const disarm = (): void => {
      pending = null;
      window.clearTimeout(pendingTimer);
    };

    const run = (action: ShortcutAction, key: string): boolean => {
      const s = latest.current;
      const quotes = quotesRef.current;
      const go = (path: string): true => {
        s.onNavigate();
        s.navigate(path);
        return true;
      };
      switch (action) {
        case "focusSearch":
          if (!quotes) return false;
          quotes.focusSearch();
          return true;
        case "escape":
          return quotes?.clearSearch() ?? false;
        case "moveFocus":
          return moveFocus(key);
        case "toggleView": {
          if (!quotes) return false;
          const next = s.view === "cards" ? "table" : "cards";
          s.setPreference(next);
          setAnnouncement(next === "table" ? "Table view" : "Card view");
          return true;
        }
        case "togglePause":
          s.toggleFeedPaused();
          setAnnouncement(s.feedPaused ? "Live feed resumed" : "Live feed paused");
          return true;
        case "goQuotes":
          return go("/");
        case "goChart":
          return go("/chart");
        case "goHistory":
          return go("/history");
        case "goSettings":
          return go("/settings");
        case "help":
          s.openHelp();
          return true;
        case "openFocused":
          return false;
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (isTypingTarget(event.target) || overlayOpen()) {
        disarm();
        return;
      }
      const result = matchKey(event, pending, latest.current.enabled);
      disarm();
      if (result.kind === "pending") {
        pending = result.prefix;
        pendingTimer = window.setTimeout(disarm, SEQUENCE_TIMEOUT_MS);
        event.preventDefault();
        return;
      }
      if (result.kind === "action" && run(result.action, result.key)) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(pendingTimer);
    };
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled, openHelp, registerQuotes }), [enabled, setEnabled, openHelp, registerQuotes]);

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      {/* Says what a shortcut did when the change is not where focus is (the feed may be off screen). */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ShortcutsHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        enabled={enabled}
        onCloseAutoFocus={(event) => {
          const opener = helpOpenerRef.current;
          helpOpenerRef.current = null;
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
      />
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts(): ShortcutsContextValue {
  const value = useContext(ShortcutsContext);
  if (!value) throw new Error("useShortcuts needs a ShortcutsProvider");
  return value;
}

/** Registers the quotes page's search actions while the page is mounted. */
export function useQuotesShortcuts(actions: QuotesShortcuts): void {
  const { registerQuotes } = useShortcuts();
  useEffect(() => {
    registerQuotes(actions);
    return () => registerQuotes(null);
  }, [registerQuotes, actions]);
}

const kbdClass = "rounded border border-default bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-primary";

/** The `?` dialog, generated from `SHORTCUTS`. */
function ShortcutsHelp(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
  onCloseAutoFocus: (event: Event) => void;
}): JSX.Element {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[6px]" />
        <Dialog.Content
          onCloseAutoFocus={props.onCloseAutoFocus}
          className={
            "fixed inset-0 z-40 overflow-y-auto bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] " +
            "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100dvh-32px)] md:w-[min(480px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 " +
            "md:rounded-[14px] md:border md:border-default md:shadow-dialog"
          }
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <Dialog.Title className="text-[16px] font-semibold text-primary">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className={`-mt-1.5 -mr-1.5 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-[24px] text-secondary transition-colors duration-150 hover:text-primary ${focusRing}`}
            >
              ×
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-[13px] text-secondary">
            {props.enabled
              ? "Single-key shortcuts do nothing while you type in a field. Turn them off in Settings, Preferences."
              : "Single-key shortcuts are off (Settings, Preferences). Arrows, Enter and Esc still work."}
          </Dialog.Description>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} aria-labelledby={`shortcuts-${group}`} className="mb-4 last:mb-0">
              <h3 id={`shortcuts-${group}`} className="mb-1.5 text-[11px] tracking-widest text-secondary uppercase">
                {group}
              </h3>
              <dl className="grid gap-1.5">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.action} className="flex items-center justify-between gap-3">
                    <dt className="text-[13px] text-primary">
                      {s.description}
                      {s.characterKey && !props.enabled && <span className="text-secondary"> (off)</span>}
                    </dt>
                    <dd className="flex shrink-0 items-center gap-1 text-[12px] text-secondary">
                      {s.sequences.map((seq) => (
                        <span key={seq.join(" ")} className="flex items-center gap-1">
                          {seq.map((key, j) => (
                            <span key={key} className="flex items-center gap-1">
                              {j > 0 && <span>then</span>}
                              <kbd className={kbdClass}>
                                <span aria-hidden="true">{keyLabel(key)}</span>
                                <span className="sr-only">{spokenKey(key)}</span>
                              </kbd>
                            </span>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
