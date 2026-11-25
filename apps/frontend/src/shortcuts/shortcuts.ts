/**
 * Keyboard shortcuts (D5), as data: the central handler matches key presses
 * against this list and the help dialog is generated from it.
 *
 * Keys are `KeyboardEvent.key` values, the produced character, not the physical
 * key, so `/` and `?` work on every keyboard layout.
 */

export type ShortcutAction =
  | "focusSearch"
  | "escape"
  | "moveFocus"
  | "openFocused"
  | "goQuotes"
  | "goPortfolio"
  | "goChart"
  | "goHistory"
  | "goSettings"
  | "togglePause"
  | "toggleView"
  | "help";

export type ShortcutGroup = "Quotes" | "Go to" | "Feed" | "Help";

export type Shortcut = {
  action: ShortcutAction;
  /** Alternatives; each is one key or a sequence (`["g", "q"]`). */
  sequences: readonly (readonly string[])[];
  description: string;
  group: ShortcutGroup;
  /**
   * A printable character with no modifier. These are the ones the setting turns
   * off (WCAG 2.1.4); arrows, Enter and Escape always work.
   */
  characterKey: boolean;
  /**
   * Done by the focused element itself (a card or row is a button): listed in the
   * help, never dispatched by the handler.
   */
  native?: true;
};

export const SHORTCUTS: readonly Shortcut[] = [
  { action: "focusSearch", sequences: [["/"]], description: "Search the quotes", group: "Quotes", characterKey: true },
  {
    action: "escape",
    sequences: [["Escape"]],
    description: "Clear the search, or close the open dialog",
    group: "Quotes",
    characterKey: false,
  },
  {
    action: "moveFocus",
    sequences: [["ArrowLeft"], ["ArrowRight"], ["ArrowUp"], ["ArrowDown"]],
    description: "Move between cards or table rows",
    group: "Quotes",
    characterKey: false,
  },
  {
    action: "openFocused",
    sequences: [["Enter"]],
    description: "Open the focused quote",
    group: "Quotes",
    characterKey: false,
    native: true,
  },
  { action: "toggleView", sequences: [["v"]], description: "Switch between cards and table", group: "Quotes", characterKey: true },
  { action: "goQuotes", sequences: [["g", "q"]], description: "Quotes", group: "Go to", characterKey: true },
  { action: "goPortfolio", sequences: [["g", "p"]], description: "Portfolio", group: "Go to", characterKey: true },
  { action: "goChart", sequences: [["g", "c"]], description: "Chart", group: "Go to", characterKey: true },
  { action: "goHistory", sequences: [["g", "h"]], description: "History", group: "Go to", characterKey: true },
  { action: "goSettings", sequences: [["g", "s"]], description: "Settings", group: "Go to", characterKey: true },
  { action: "togglePause", sequences: [["p"]], description: "Pause or resume the live feed", group: "Feed", characterKey: true },
  { action: "help", sequences: [["?"]], description: "Show these shortcuts", group: "Help", characterKey: true },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["Quotes", "Go to", "Feed", "Help"];

/** A first key of a sequence stays armed this long. */
export const SEQUENCE_TIMEOUT_MS = 1000;

/** What the handler needs from a key press. */
export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

export type MatchResult =
  | { kind: "action"; action: ShortcutAction; key: string }
  /** The first key of a sequence: wait for the next one. */
  | { kind: "pending"; prefix: string }
  | { kind: "none" };

/**
 * Matches one key press. `pending` is the armed first key of a sequence, if any
 * (the caller drops it after `SEQUENCE_TIMEOUT_MS`). A key that does not complete
 * the pending sequence is matched on its own, so a stray `g` swallows nothing.
 * With Ctrl, Alt or Meta held nothing matches: those belong to the browser.
 */
export function matchKey(press: KeyPress, pending: string | null, characterKeysOn: boolean): MatchResult {
  if (press.ctrlKey || press.altKey || press.metaKey) return { kind: "none" };
  const usable = SHORTCUTS.filter((s) => !s.native && (characterKeysOn || !s.characterKey));

  if (pending !== null) {
    for (const s of usable) {
      if (s.sequences.some((seq) => seq.length === 2 && seq[0] === pending && seq[1] === press.key)) {
        return { kind: "action", action: s.action, key: press.key };
      }
    }
  }
  for (const s of usable) {
    for (const seq of s.sequences) {
      if (seq.length === 1 && seq[0] === press.key) return { kind: "action", action: s.action, key: press.key };
      if (seq.length === 2 && seq[0] === press.key) return { kind: "pending", prefix: press.key };
    }
  }
  return { kind: "none" };
}

export type Direction = "left" | "right" | "up" | "down";

export const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export type Box = { left: number; top: number; width: number; height: number };

/**
 * The neighbour of `from` in a direction, from on-screen positions, so it works
 * for any number of grid columns and for table rows alike. Left and right stay in
 * the same row; up and down go to the nearest row and the closest item in it.
 * Returns an index into `boxes`, or -1 at an edge.
 */
export function neighbourIndex(boxes: readonly Box[], from: number, direction: Direction): number {
  const origin = boxes[from];
  if (!origin) return -1;
  const cx = (b: Box): number => b.left + b.width / 2;
  const cy = (b: Box): number => b.top + b.height / 2;
  const sameRow = (b: Box): boolean => Math.abs(cy(b) - cy(origin)) < Math.min(b.height, origin.height) / 2;

  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    let score: number;
    if (direction === "left" || direction === "right") {
      if (!sameRow(b)) return;
      const dx = direction === "right" ? cx(b) - cx(origin) : cx(origin) - cx(b);
      if (dx <= 0) return;
      score = dx;
    } else {
      const dy = direction === "down" ? cy(b) - cy(origin) : cy(origin) - cy(b);
      if (dy <= 0 || sameRow(b)) return;
      // The nearest row first, then the closest item in it.
      score = dy * 10_000 + Math.abs(cx(b) - cx(origin));
    }
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** How a key reads in the help dialog. */
export function keyLabel(key: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
  };
  return labels[key] ?? key;
}

/** How a key is read out: the glyphs above mean little to a screen reader. */
export function spokenKey(key: string): string {
  const names: Record<string, string> = {
    ArrowLeft: "Left arrow",
    ArrowRight: "Right arrow",
    ArrowUp: "Up arrow",
    ArrowDown: "Down arrow",
    Escape: "Escape",
    "/": "slash",
    "?": "question mark",
  };
  return names[key] ?? key;
}
