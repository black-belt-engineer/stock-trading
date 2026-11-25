import type { WatchlistApi, WatchlistEntry, WriteResult } from "./watchlistApi";

/**
 * `loading`: the first load has not answered yet. `ready`: stars work. `unavailable`: the
 * service could not be reached; stars are read-only (they show the last known list) until a
 * reload succeeds.
 */
export type WatchlistStatus = "loading" | "ready" | "unavailable";

export type WatchlistSnapshot = {
  status: WatchlistStatus;
  /** The list as the user sees it: the server's, with changes not yet confirmed applied. */
  items: readonly WatchlistEntry[];
  starred: ReadonlySet<string>;
  /** The last write that failed and was rolled back; `null` once dismissed or replaced. */
  notice: string | null;
};

/** The visible list: `confirmed` without symbols about to be removed, plus symbols about to be added. */
export function effectiveItems(
  confirmed: readonly WatchlistEntry[],
  desired: ReadonlyMap<string, boolean>,
  order: readonly string[] | null,
): WatchlistEntry[] {
  const kept = confirmed.filter((entry) => desired.get(entry.symbol) !== false);
  const onList = new Set(kept.map((entry) => entry.symbol));
  for (const [symbol, wanted] of desired) {
    if (wanted && !onList.has(symbol)) {
      kept.push({ symbol, listed: true });
      onList.add(symbol);
    }
  }
  if (order === null) return kept;
  const rank = new Map(order.map((symbol, index) => [symbol, index]));
  // Symbols the pending order does not name (added meanwhile) go last, as the server does.
  return kept
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (rank.get(a.entry.symbol) ?? order.length + a.index) - (rank.get(b.entry.symbol) ?? order.length + b.index))
    .map(({ entry }) => entry);
}

/** `symbols` with `symbol` moved by `delta` places, clamped to the ends. */
export function moveSymbol(symbols: readonly string[], symbol: string, delta: number): string[] {
  const from = symbols.indexOf(symbol);
  if (from === -1) return [...symbols];
  const to = Math.min(symbols.length - 1, Math.max(0, from + delta));
  const next = [...symbols];
  next.splice(from, 1);
  next.splice(to, 0, symbol);
  return next;
}

function failureMessage(result: WriteResult, symbol: string, adding: boolean): string | null {
  switch (result) {
    case "ok":
    case "loggedOut":
      return null;
    case "full":
      return "Your watchlist is full (100 symbols). Remove one to add another.";
    case "unknown":
      return `${symbol} is no longer listed, so it cannot be added.`;
    case "failed":
      return adding ? `Could not add ${symbol} to the watchlist. Try again.` : `Could not remove ${symbol} from the watchlist. Try again.`;
  }
}

/**
 * The watchlist on the client (P1). A star changes at once (optimistic) and is rolled back
 * with a notice when the server refuses it.
 *
 * Writes for one symbol never overlap: while one is on its way, further clicks only change the
 * wanted state, and when it returns the store sends whatever is still needed. A double-click
 * therefore ends as nothing or as one add and one remove, in that order, never as a remove
 * overtaken by its add. A reload that started before a write was confirmed is ignored, so a stale
 * answer cannot undo a star.
 */
export class WatchlistStore {
  private confirmed: WatchlistEntry[] = [];
  private readonly desired = new Map<string, boolean>();
  private readonly running = new Set<string>();
  private order: string[] | null = null;
  private orderRunning = false;
  private orderDirty = false;
  private status: WatchlistStatus = "loading";
  private notice: string | null = null;
  private writes = 0;
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: WatchlistSnapshot;

  constructor(private readonly api: WatchlistApi) {
    this.snapshot = this.build();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WatchlistSnapshot => this.snapshot;

  /** (Re)loads the list from the server. Concurrent calls share one request. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const writesAtStart = this.writes;
    this.loading = this.api
      .load()
      .then(
        (entries) => {
          // A write confirmed meanwhile may be missing from this answer; the next load catches up.
          if (this.writes !== writesAtStart && this.status === "ready") return;
          this.confirmed = entries;
          this.status = "ready";
        },
        () => {
          this.status = "unavailable";
        },
      )
      .finally(() => {
        this.loading = null;
        this.emit();
      });
    return this.loading;
  }

  isStarred(symbol: string): boolean {
    return this.snapshot.starred.has(symbol);
  }

  toggle(symbol: string): void {
    this.setWanted(symbol, !this.isStarred(symbol));
  }

  remove(symbol: string): void {
    this.setWanted(symbol, false);
  }

  /** Moves `symbol` up (negative) or down (positive) and saves the whole order. */
  move(symbol: string, delta: number): void {
    if (this.status !== "ready") return;
    this.order = moveSymbol(this.snapshot.items.map((entry) => entry.symbol), symbol, delta);
    this.emit();
    this.orderDirty = true;
    if (!this.orderRunning) void this.runOrder();
  }

  dismissNotice(): void {
    if (this.notice === null) return;
    this.notice = null;
    this.emit();
  }

  private setWanted(symbol: string, wanted: boolean): void {
    if (this.status !== "ready") return;
    this.desired.set(symbol, wanted);
    this.emit();
    if (!this.running.has(symbol)) void this.run(symbol);
  }

  private onServer(symbol: string): boolean {
    return this.confirmed.some((entry) => entry.symbol === symbol);
  }

  private async run(symbol: string): Promise<void> {
    this.running.add(symbol);
    try {
      for (;;) {
        const wanted = this.desired.get(symbol);
        if (wanted === undefined || wanted === this.onServer(symbol)) {
          this.desired.delete(symbol);
          return;
        }
        const result = wanted ? await this.api.add(symbol) : await this.api.remove(symbol);
        this.writes += 1;
        if (result !== "ok") {
          // Roll back to what the server has; a click made meanwhile is dropped with it.
          this.desired.delete(symbol);
          this.notice = failureMessage(result, symbol, wanted) ?? this.notice;
          if (result === "failed") void this.load();
          return;
        }
        this.confirmed = wanted
          ? [...this.confirmed, { symbol, listed: true }]
          : this.confirmed.filter((entry) => entry.symbol !== symbol);
      }
    } finally {
      this.running.delete(symbol);
      this.emit();
    }
  }

  private async runOrder(): Promise<void> {
    this.orderRunning = true;
    try {
      while (this.orderDirty && this.order !== null) {
        this.orderDirty = false;
        const order = this.order;
        // Only symbols the server already has; one still being added is appended there anyway.
        const payload = order.filter((symbol) => this.onServer(symbol));
        const result = await this.api.saveOrder(payload);
        this.writes += 1;
        if (result !== "ok") {
          this.order = null;
          this.orderDirty = false;
          if (result !== "loggedOut") this.notice = "Could not save the new order. Try again.";
          void this.load();
          return;
        }
        const rank = new Map(order.map((symbol, index) => [symbol, index]));
        this.confirmed = [...this.confirmed].sort(
          (a, b) => (rank.get(a.symbol) ?? order.length) - (rank.get(b.symbol) ?? order.length),
        );
      }
      this.order = null;
    } finally {
      this.orderRunning = false;
      this.emit();
    }
  }

  private build(): WatchlistSnapshot {
    const items = effectiveItems(this.confirmed, this.desired, this.order);
    return {
      status: this.status,
      items,
      starred: new Set(items.map((entry) => entry.symbol)),
      notice: this.notice,
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    for (const listener of [...this.listeners]) listener();
  }
}
