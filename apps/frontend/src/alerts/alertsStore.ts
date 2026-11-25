import type { AlertLists, AlertsApi, CreateResult, NewAlert, PriceAlert } from "./alertsApi";
import { centsOf, conditionMet, formatCents, priceToCents } from "./money";

/**
 * `loading`: the first load has not answered. `ready`: alerts are being checked. `unavailable`:
 * the service could not be reached; the last known alerts are still checked, and a reload on
 * focus or Retry tries again.
 */
export type AlertsStatus = "loading" | "ready" | "unavailable";

/** A triggered alert this tab was first to confirm, shown until dismissed. */
export type AlertToast = { alert: PriceAlert };

export type AlertsSnapshot = {
  status: AlertsStatus;
  /** Oldest first. */
  active: readonly PriceAlert[];
  /** Most recently triggered first. */
  history: readonly PriceAlert[];
  /** Newest first. */
  toasts: readonly AlertToast[];
  /** Triggered alerts newer than the last time the bell was opened (any tab or device). */
  unseen: number;
  /** The last write that failed and was rolled back; `null` once dismissed. */
  notice: string | null;
};

/** The latest price per symbol, as the stream provides it. */
export type PriceLookup = ReadonlyMap<string, { price: number }>;

/** How long to wait before trying a trigger again after it failed (network, 5xx). */
export const TRIGGER_RETRY_MS = 5000;

export type AlertsStoreOptions = {
  /** Called once per alert this tab was first to trigger: the place for a browser notification. */
  onFired?: (alert: PriceAlert) => void;
  /** Persists "the bell was last opened at" across reloads and tabs. */
  seenStore?: { read: () => number; write: (at: number) => void };
  now?: () => number;
};

function without(list: readonly PriceAlert[], id: string): PriceAlert[] {
  return list.filter((alert) => alert.id !== id);
}

function byTriggerTimeDesc(a: PriceAlert, b: PriceAlert): number {
  return (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0);
}

/**
 * The user's alerts and their evaluation in this tab (P2, Q7: evaluated in the browser while the
 * app is open). The server decides who notifies: every tab that sees a crossing calls trigger,
 * and only the call that set `triggeredAt` gets `first: true`. So two tabs (or devices) show one
 * notification per alert between them.
 *
 * Creates are not optimistic (the server assigns the id and may refuse at the cap); removes are,
 * with a rollback and a notice when refused. A reload that overlapped a write (create, remove or
 * trigger) is ignored, so it cannot bring back a removed or triggered alert or drop a new one;
 * the next focus reloads again.
 */
export class AlertsStore {
  private snapshot: AlertsSnapshot = { status: "loading", active: [], history: [], toasts: [], unseen: 0, notice: null };
  private readonly listeners = new Set<() => void>();
  /** Alerts whose trigger call is on its way. */
  private readonly pending = new Set<string>();
  /** Alerts whose last trigger call failed, with when to try again. */
  private readonly retryAt = new Map<string, number>();
  private writesInFlight = 0;
  private writesDone = 0;
  private seenAt: number;
  private readonly now: () => number;

  constructor(
    private readonly api: AlertsApi,
    private readonly options: AlertsStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.seenAt = options.seenStore?.read() ?? 0;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AlertsSnapshot => this.snapshot;

  async load(): Promise<void> {
    const startedInFlight = this.writesInFlight;
    const startedDone = this.writesDone;
    let lists: AlertLists;
    try {
      lists = await this.api.load();
    } catch {
      this.set({ status: "unavailable" });
      return;
    }
    // A write that was on its way, or finished, while this load ran: the answer may predate it.
    if (startedInFlight > 0 || this.writesInFlight > 0 || this.writesDone !== startedDone) {
      // The first load must not be lost, or the page would show no alerts until the next focus.
      if (this.snapshot.status !== "ready") void this.load();
      return;
    }
    this.set({
      status: "ready",
      active: lists.active,
      history: [...lists.history].sort(byTriggerTimeDesc),
    });
  }

  /** Creates an alert; on success it is active (and checked) at once. */
  async create(input: NewAlert): Promise<CreateResult> {
    this.writesInFlight += 1;
    try {
      const result = await this.api.create(input);
      if (result.ok) {
        this.set({ active: [...without(this.snapshot.active, result.alert.id), result.alert] });
      }
      return result;
    } finally {
      this.writesInFlight -= 1;
      this.writesDone += 1;
    }
  }

  /** Removes an active alert or a history entry at once; rolled back with a notice if refused. */
  async remove(id: string): Promise<void> {
    const before = { active: this.snapshot.active, history: this.snapshot.history };
    const alert = [...before.active, ...before.history].find((a) => a.id === id);
    if (!alert) return;
    this.set({ active: without(before.active, id), history: without(before.history, id), notice: null });
    this.writesInFlight += 1;
    try {
      const result = await this.api.remove(id);
      if (result === "failed") {
        // Put it back where it was, unless it changed meanwhile (triggered in this tab).
        const stillTriggered = this.snapshot.history.some((a) => a.id === id);
        this.set({
          active: alert.triggeredAt === null && !stillTriggered ? [...this.snapshot.active, alert].sort((a, b) => a.createdAt - b.createdAt) : this.snapshot.active,
          history: alert.triggeredAt !== null ? [...this.snapshot.history, alert].sort(byTriggerTimeDesc) : this.snapshot.history,
          notice: `Could not delete the ${alert.symbol} alert. Try again.`,
        });
      }
    } finally {
      this.writesInFlight -= 1;
      this.writesDone += 1;
    }
  }

  /**
   * Checks every active alert against the latest price of its symbol. Called on every stream
   * update, the connection's snapshot included, and after each load. Nothing is tracked between
   * ticks: a crossing during a disconnect is caught on the first price after it.
   */
  evaluate(prices: PriceLookup): void {
    const now = this.now();
    for (const alert of this.snapshot.active) {
      if (this.pending.has(alert.id) || (this.retryAt.get(alert.id) ?? 0) > now) continue;
      const quote = prices.get(alert.symbol);
      const thresholdCents = centsOf(alert.threshold);
      if (!quote || thresholdCents === null) continue;
      const priceCents = priceToCents(quote.price);
      if (!conditionMet(alert.direction, thresholdCents, priceCents)) continue;
      this.pending.add(alert.id);
      void this.fire(alert, formatCents(priceCents));
    }
  }

  dismissToast(id: string): void {
    this.set({ toasts: this.snapshot.toasts.filter((toast) => toast.alert.id !== id) });
  }

  dismissNotice(): void {
    this.set({ notice: null });
  }

  /** The bell was opened: every trigger so far counts as seen. */
  markSeen(): void {
    const newest = this.snapshot.history.reduce((max, a) => Math.max(max, a.triggeredAt ?? 0), this.seenAt);
    this.seenAt = Math.max(newest, this.seenAt);
    this.options.seenStore?.write(this.seenAt);
    this.set({});
  }

  /** Another tab opened its bell. */
  syncSeen(at: number): void {
    if (at <= this.seenAt) return;
    this.seenAt = at;
    this.set({});
  }

  private async fire(alert: PriceAlert, price: string): Promise<void> {
    // A trigger is a write: a reload that started before it answered would bring the alert back.
    this.writesInFlight += 1;
    try {
      const result = await this.api.trigger(alert.id, price);
      switch (result.kind) {
        case "confirmed": {
          this.retryAt.delete(alert.id);
          this.set({
            active: without(this.snapshot.active, alert.id),
            history: [result.alert, ...without(this.snapshot.history, alert.id)].sort(byTriggerTimeDesc),
            toasts: result.first ? [{ alert: result.alert }, ...this.snapshot.toasts] : this.snapshot.toasts,
          });
          if (result.first) this.options.onFired?.(result.alert);
          return;
        }
        case "gone":
          // Deleted in another tab or device: drop it without a word.
          this.retryAt.delete(alert.id);
          this.set({ active: without(this.snapshot.active, alert.id) });
          return;
        case "loggedOut":
          return;
        case "refused":
        case "failed":
          this.retryAt.set(alert.id, this.now() + TRIGGER_RETRY_MS);
          return;
      }
    } finally {
      this.pending.delete(alert.id);
      this.writesInFlight -= 1;
      this.writesDone += 1;
    }
  }

  private set(patch: Partial<AlertsSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    next.unseen = next.history.filter((a) => (a.triggeredAt ?? 0) > this.seenAt).length;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
