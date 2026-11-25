import type { Logger } from "@stock-platform/logger";
import { LatestPriceSchema, parseJson, streamQuoteFromLatest, type StreamQuote } from "@stock-platform/types";
import { RecentEntries, type BufferedEntry } from "../models/recent-entries.js";
import { priceFrame, snapshotFrame } from "../models/sse-frames.js";
import { compareStreamIds, parseStreamId, streamIdTime, type StreamId } from "../models/stream-ids.js";
import type { RawStreamEntry, StreamReader } from "./redis-stream-reader.js";

/** One open stream, as the hub sees it. The route owns the connection. */
export type StreamSubscriber = {
  /** Already validated (see `parseSymbolList`). */
  readonly symbols: ReadonlySet<string>;
  /** Writes one frame. */
  send(frame: string): void;
  /** Ends the connection: the hub could not start it (no snapshot) or is shutting down. */
  end(): void;
};

export type StreamHubStats = {
  subscribers: number;
  /** `stopped` when nobody is subscribed. */
  reader: "stopped" | "starting" | "connected" | "disconnected";
  /** Now minus the time of the newest entry read, or null before the first one. */
  readerLagMs: number | null;
  /** Entries held for resume. */
  bufferedEntries: number;
};

export type StreamHubOptions = {
  /** Opens the one reader connection; called when the first subscriber arrives. */
  openReader: () => StreamReader;
  /** The latest quote of each symbol that has one (the snapshot). */
  loadQuotes: (symbols: readonly string[]) => Promise<StreamQuote[]>;
  log: Logger;
  /** Resume window (decided by the owner: 60 s and 2,000 entries). */
  maxAgeMs?: number;
  maxEntries?: number;
  /** How long one blocking read waits; also how long the reader outlives its last subscriber. */
  blockMs?: number;
  /** How long the reader may be disconnected before readiness fails (owner: 10 s). */
  unhealthyAfterMs?: number;
  now?: () => number;
};

const DEFAULTS = {
  maxAgeMs: 60_000,
  maxEntries: 2000,
  blockMs: 5000,
  unhealthyAfterMs: 10_000,
};

/** Entries per `XREAD`: a burst after a stall is read in several rounds instead of one huge reply. */
const READ_COUNT = 500;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;

type Registration = {
  subscriber: StreamSubscriber;
  /** Until its replay or snapshot has been written, live entries wait in `queue`. */
  live: boolean;
  queue: BufferedEntry[];
  closed: boolean;
};

/** One reader connection and its loop, from the first subscriber to the last. */
type ReaderRun = {
  reader: StreamReader;
  recent: RecentEntries;
  /** Where the next read starts; set by priming. */
  lastId: string;
  primed: boolean;
  /** Resolves once primed, or when the run ends without priming. */
  whenPrimed: Promise<void>;
  resolvePrimed: () => void;
  /** Set while the connection is down; null while it is up (or has not failed yet). */
  disconnectedSince: number | null;
  /** Time of the newest entry read. */
  lastEntryAt: number | null;
  /** After a reconnect or failed read every subscriber gets a fresh snapshot. */
  resyncPending: boolean;
  resyncing: boolean;
  /** Cuts a backoff wait short (shutdown). */
  wake: (() => void) | null;
  done: Promise<void>;
};

/** Reads one entry's quote; null for a malformed entry or one in the format before session values. */
export function quoteFromStreamFields(fieldList: readonly string[]): StreamQuote | null {
  let payload: string | undefined;
  for (let i = 0; i + 1 < fieldList.length; i += 2) {
    if (fieldList[i] === "payload") payload = fieldList[i + 1];
  }
  if (payload === undefined) return null;
  const latest = parseJson(LatestPriceSchema, payload);
  return latest ? streamQuoteFromLatest(latest) : null;
}

/**
 * S2: one Redis reader per process, shared by every open stream.
 *
 * - The reader starts with the first subscriber and stops once none is left (after the blocking
 *   read in flight returns). A subscriber arriving before then keeps the same run: there is never
 *   more than one loop.
 * - Each entry is parsed and serialised once, then written to the subscribers of its symbol only.
 * - The newest entries are kept in memory for S1's resume. Priming fills that buffer from Redis
 *   (`XREVRANGE`) before the first read, so a resume works even when the reader had stopped or the
 *   service restarted, and the first read starts at the stream's last id taken before any
 *   subscriber's snapshot, which closes the gap between snapshot and live ticks (S1 step 7).
 * - Read errors are logged and retried with exponential backoff. After a reconnect the buffer is
 *   cleared (it can no longer prove nothing is missing) and every subscriber gets a snapshot.
 */
export class StreamHub {
  private readonly bySymbol = new Map<string, Set<Registration>>();
  private readonly all = new Set<Registration>();
  private run: ReaderRun | null = null;
  private closed = false;
  private readonly settings: typeof DEFAULTS;
  private readonly now: () => number;

  constructor(private readonly options: StreamHubOptions) {
    this.settings = {
      maxAgeMs: options.maxAgeMs ?? DEFAULTS.maxAgeMs,
      maxEntries: options.maxEntries ?? DEFAULTS.maxEntries,
      blockMs: options.blockMs ?? DEFAULTS.blockMs,
      unhealthyAfterMs: options.unhealthyAfterMs ?? DEFAULTS.unhealthyAfterMs,
    };
    this.now = options.now ?? Date.now;
  }

  /**
   * Starts delivering to `subscriber`: first the entries after `lastId` when the buffer still
   * holds it (a resume), otherwise a snapshot, then live entries with nothing missed or doubled
   * in between. Returns the function that unsubscribes; safe to call at any point, also before
   * the start has finished.
   */
  subscribe(subscriber: StreamSubscriber, lastId: StreamId | null): () => void {
    const registration: Registration = { subscriber, live: false, queue: [], closed: false };
    if (this.closed) {
      subscriber.end();
      return () => {};
    }
    this.all.add(registration);
    for (const symbol of subscriber.symbols) {
      let set = this.bySymbol.get(symbol);
      if (!set) {
        set = new Set();
        this.bySymbol.set(symbol, set);
      }
      set.add(registration);
    }
    const run = this.ensureRun();
    void this.start(registration, run, lastId);
    return () => this.remove(registration);
  }

  stats(): StreamHubStats {
    const run = this.run;
    const now = this.now();
    let reader: StreamHubStats["reader"] = "stopped";
    if (run) {
      if (run.disconnectedSince !== null) reader = "disconnected";
      else reader = run.primed ? "connected" : "starting";
    }
    return {
      subscribers: this.all.size,
      reader,
      readerLagMs: run?.lastEntryAt == null ? null : Math.max(0, now - run.lastEntryAt),
      bufferedEntries: run?.recent.size ?? 0,
    };
  }

  /** False once the reader has been disconnected for longer than the limit while someone is subscribed. */
  isReaderHealthy(): boolean {
    const since = this.run?.disconnectedSince;
    if (since == null) return true;
    return this.now() - since <= this.settings.unhealthyAfterMs;
  }

  /** Graceful shutdown: stop the loop, end every stream, close the reader connection. */
  async close(): Promise<void> {
    this.closed = true;
    for (const registration of [...this.all]) {
      this.remove(registration);
      this.safely(() => registration.subscriber.end());
    }
    const run = this.run;
    if (!run) return;
    run.reader.close();
    run.wake?.();
    await run.done;
  }

  private async start(registration: Registration, run: ReaderRun, lastId: StreamId | null): Promise<void> {
    await run.whenPrimed;
    if (registration.closed) return;

    const replay = lastId ? run.recent.after(lastId, this.now()) : null;
    if (replay && lastId) {
      let upTo = lastId;
      for (const entry of replay) {
        upTo = entry.id;
        if (registration.subscriber.symbols.has(entry.symbol)) this.deliver(registration, entry.frame);
      }
      // Anything queued meanwhile and already replayed is not sent twice.
      this.goLive(registration, (entry) => compareStreamIds(entry.id, upTo) > 0);
      return;
    }

    let quotes: StreamQuote[];
    try {
      quotes = await this.options.loadQuotes([...registration.subscriber.symbols]);
    } catch (err) {
      // Without a snapshot the client would show stale prices as current; let it reconnect.
      this.options.log.warn({ err }, "Could not load the snapshot for a new stream");
      this.remove(registration);
      this.safely(() => registration.subscriber.end());
      return;
    }
    if (registration.closed) return;
    for (const quote of quotes) this.deliver(registration, snapshotFrame(quote));
    this.goLive(registration, () => true);
  }

  private goLive(registration: Registration, keep: (entry: BufferedEntry) => boolean): void {
    for (const entry of registration.queue) {
      if (keep(entry)) this.deliver(registration, entry.frame);
    }
    registration.queue = [];
    registration.live = true;
  }

  private remove(registration: Registration): void {
    if (registration.closed) return;
    registration.closed = true;
    registration.queue = [];
    this.all.delete(registration);
    for (const symbol of registration.subscriber.symbols) {
      const set = this.bySymbol.get(symbol);
      set?.delete(registration);
      if (set?.size === 0) this.bySymbol.delete(symbol);
    }
    // The loop notices an empty registry when its blocking read returns.
  }

  /** One subscriber failing must not stop delivery to the others. */
  private deliver(registration: Registration, frame: string): void {
    if (registration.closed) return;
    this.safely(() => registration.subscriber.send(frame));
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch (err) {
      this.options.log.error({ err }, "Stream subscriber failed");
    }
  }

  private ensureRun(): ReaderRun {
    if (this.run) return this.run;
    let resolvePrimed = (): void => {};
    const whenPrimed = new Promise<void>((resolve) => {
      resolvePrimed = resolve;
    });
    const run: ReaderRun = {
      reader: this.options.openReader(),
      recent: new RecentEntries({ maxAgeMs: this.settings.maxAgeMs, maxEntries: this.settings.maxEntries }),
      lastId: "0-0",
      primed: false,
      whenPrimed,
      resolvePrimed,
      disconnectedSince: null,
      lastEntryAt: null,
      resyncPending: false,
      resyncing: false,
      wake: null,
      done: Promise.resolve(),
    };
    run.reader.onConnectionChange((connected) => {
      if (!connected) {
        run.disconnectedSince ??= this.now();
        return;
      }
      if (run.disconnectedSince === null) return;
      run.disconnectedSince = null;
      // A blocking read in flight is resent by ioredis without an error, so the loop may not notice.
      if (run.primed) this.resync(run);
    });
    this.run = run;
    run.done = this.loop(run);
    return run;
  }

  private shouldRun(run: ReaderRun): boolean {
    return !this.closed && this.run === run && this.all.size > 0;
  }

  private async loop(run: ReaderRun): Promise<void> {
    let failures = 0;
    while (this.shouldRun(run)) {
      try {
        if (!run.primed) {
          await this.prime(run);
        } else {
          const entries = await run.reader.readAfter(run.lastId, this.settings.blockMs, READ_COUNT);
          this.dispatch(run, entries);
          if (run.resyncPending) this.resync(run);
        }
        failures = 0;
      } catch (err) {
        if (!this.shouldRun(run)) break;
        failures += 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        this.options.log.warn({ err, attempt: failures, retryInMs: delay }, "Price stream read failed");
        if (run.primed) run.resyncPending = true;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          run.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        run.wake = null;
      }
    }
    // Runs in the same turn as the check above, so a subscriber arriving from now on starts a new run.
    if (this.run === run) this.run = null;
    run.resolvePrimed();
    run.reader.close();
  }

  /** Fills the resume buffer from Redis and starts the reads at the stream's last id. */
  private async prime(run: ReaderRun): Promise<void> {
    const entries = await run.reader.readLatest(this.settings.maxEntries);
    run.recent.clear();
    const newest = entries.at(-1);
    if (newest) run.lastId = newest.id;
    const now = this.now();
    for (const raw of entries) {
      const entry = this.toEntry(raw);
      if (entry) run.recent.push(entry, now);
    }
    if (newest) this.noteEntryTime(run, newest.id);
    run.primed = true;
    run.resolvePrimed();
  }

  private dispatch(run: ReaderRun, entries: readonly RawStreamEntry[]): void {
    const now = this.now();
    for (const raw of entries) {
      run.lastId = raw.id;
      this.noteEntryTime(run, raw.id);
      const entry = this.toEntry(raw);
      if (!entry) continue;
      run.recent.push(entry, now);
      const set = this.bySymbol.get(entry.symbol);
      if (!set) continue;
      // A copy: a write can end a connection, which removes it from the set.
      for (const registration of [...set]) {
        if (registration.closed) continue;
        if (registration.live) this.deliver(registration, entry.frame);
        else registration.queue.push(entry);
      }
    }
  }

  private toEntry(raw: RawStreamEntry): BufferedEntry | null {
    const id = parseStreamId(raw.id);
    const quote = quoteFromStreamFields(raw.fields);
    if (!id || !quote) return null;
    return { id, symbol: quote.symbol, frame: priceFrame(raw.id, quote) };
  }

  private noteEntryTime(run: ReaderRun, rawId: string): void {
    const id = parseStreamId(rawId);
    if (id) run.lastEntryAt = streamIdTime(id);
  }

  /**
   * After the reader lost its connection or a read failed, ticks may have been missed: forget the
   * resume buffer and send every live subscriber a fresh snapshot of its symbols.
   */
  private resync(run: ReaderRun): void {
    run.resyncPending = false;
    run.recent.clear();
    if (run.resyncing) {
      run.resyncPending = true;
      return;
    }
    run.resyncing = true;
    void this.sendSnapshots()
      .catch((err: unknown) => {
        run.resyncPending = true;
        this.options.log.warn({ err }, "Could not send snapshots after the reader reconnected");
      })
      .finally(() => {
        run.resyncing = false;
      });
  }

  private async sendSnapshots(): Promise<void> {
    const targets = [...this.all].filter((registration) => registration.live);
    const symbols = new Set<string>();
    for (const registration of targets) {
      for (const symbol of registration.subscriber.symbols) symbols.add(symbol);
    }
    if (symbols.size === 0) return;
    this.options.log.info({ subscribers: targets.length }, "Price stream reader reconnected; sending snapshots");
    const quotes = await this.options.loadQuotes([...symbols]);
    const frames = new Map(quotes.map((quote) => [quote.symbol, snapshotFrame(quote)]));
    for (const registration of targets) {
      for (const symbol of registration.subscriber.symbols) {
        const frame = frames.get(symbol);
        if (frame !== undefined) this.deliver(registration, frame);
      }
    }
  }
}
