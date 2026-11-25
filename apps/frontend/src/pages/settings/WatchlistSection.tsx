import { useLayoutEffect, useRef } from "react";
import type { JSX } from "react";
import { Link } from "react-router";
import { buttonClass } from "../../components/pageStyles";
import { useStreamData } from "../../stream/StreamProvider";
import { useWatchlist } from "../../watchlist/WatchlistProvider";
import { SettingsSection } from "./fields";

const smallButton = `${buttonClass} h-8 px-2.5 text-[13px]`;

type Direction = "up" | "down";
type FocusTarget = { symbol: string; button: Direction | "remove" } | { symbol: null; button: "link" };

/**
 * Settings → Watchlist (P1, owner's decision): the starred symbols in their order, with
 * Move up, Move down and Remove for each. The order is what the quotes page shows first under
 * the default sort. A symbol that has left the registry stays here, greyed and marked, so it
 * can be removed; the quotes page no longer shows it.
 *
 * Buttons, not drag and drop: every step works from the keyboard. After a move the focus
 * stays on the moved symbol's button, or its other arrow when it reached an end.
 */
export function WatchlistSection(): JSX.Element {
  const { items, status, move, remove } = useWatchlist();
  const { stocks } = useStreamData();
  const names = new Map(stocks.map((s) => [s.symbol, s.name]));
  const listRef = useRef<HTMLOListElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  // Moving or removing a row would leave focus on a button that moved or is gone.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target.symbol === null) {
      linkRef.current?.focus();
      return;
    }
    const find = (kind: string): HTMLButtonElement | null =>
      listRef.current?.querySelector<HTMLButtonElement>(`button[data-action="${kind}"][data-for="${CSS.escape(target.symbol)}"]`) ?? null;
    const same = find(target.button);
    const other = target.button === "remove" ? null : find(target.button === "up" ? "down" : "up");
    (same && !same.disabled ? same : other)?.focus();
  });

  const onMove = (symbol: string, direction: Direction): void => {
    pendingFocus.current = { symbol, button: direction };
    move(symbol, direction === "up" ? -1 : 1);
  };

  // Focus goes to the next row's Remove, or the previous one's at the end, or the Quotes link.
  const onRemove = (index: number): void => {
    const neighbour = items[index + 1] ?? items[index - 1];
    const entry = items[index];
    if (entry === undefined) return;
    pendingFocus.current = neighbour ? { symbol: neighbour.symbol, button: "remove" } : { symbol: null, button: "link" };
    remove(entry.symbol);
  };

  const ready = status === "ready";

  return (
    <SettingsSection id="settings-watchlist" title="Watchlist">
      <p className="text-secondary">
        Starred symbols come first on the{" "}
        <Link ref={linkRef} to="/" className="text-brand underline underline-offset-2">
          Quotes
        </Link>{" "}
        page, in this order. The list is kept with your account, on every device.
      </p>
      {status === "loading" && <p className="text-secondary">Loading your watchlist…</p>}
      {status === "unavailable" && items.length === 0 && (
        <p className="text-secondary">Your watchlist could not be loaded. It is read-only until it is back.</p>
      )}
      {ready && items.length === 0 && (
        <p className="text-secondary">No starred symbols yet. Star a symbol on the Quotes page to add it here.</p>
      )}
      {items.length > 0 && (
        <ol ref={listRef} aria-label="Watchlist order" className="grid gap-2">
          {items.map((entry, index) => {
            const name = names.get(entry.symbol);
            return (
              <li
                key={entry.symbol}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-subtle bg-elevated px-3 py-2"
              >
                <span className={`min-w-0 flex-1 ${entry.listed ? "" : "text-secondary"}`}>
                  <span className="font-mono font-semibold">{entry.symbol}</span>
                  <span className="ml-2 text-[13px] text-secondary">
                    {entry.listed ? (name ?? "") : "No longer listed"}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    data-action="up"
                    data-for={entry.symbol}
                    aria-label={`Move ${entry.symbol} up`}
                    disabled={!ready || index === 0}
                    onClick={() => onMove(entry.symbol, "up")}
                    className={smallButton}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    data-action="down"
                    data-for={entry.symbol}
                    aria-label={`Move ${entry.symbol} down`}
                    disabled={!ready || index === items.length - 1}
                    onClick={() => onMove(entry.symbol, "down")}
                    className={smallButton}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    data-action="remove"
                    data-for={entry.symbol}
                    aria-label={`Remove ${entry.symbol}`}
                    disabled={!ready}
                    onClick={() => onRemove(index)}
                    className={smallButton}
                  >
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SettingsSection>
  );
}
