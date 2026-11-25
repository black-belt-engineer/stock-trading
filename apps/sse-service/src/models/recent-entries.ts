import { compareStreamIds, streamIdTime, type StreamId } from "./stream-ids.js";

/** One stream entry, with its SSE frame serialised once for every subscriber (S2 step 3). */
export type BufferedEntry = {
  id: StreamId;
  symbol: string;
  /** The complete `price` frame, `id:` line included. */
  frame: string;
};

export type RecentEntriesOptions = {
  /** At most this many entries are kept. */
  maxEntries: number;
  /** Entries older than this (by their id's time) are dropped, and a resume from one is refused. */
  maxAgeMs: number;
};

/**
 * The newest stream entries, oldest first, for S1's resume (S2 step 4). A resume is honoured only
 * when the client's last id is one of the entries kept here: then everything after it is known to
 * be complete. Anything else (an id that was trimmed, aged out, is from before a Redis failover or
 * was made up) gets `null`, and the caller sends a snapshot instead.
 */
export class RecentEntries {
  private entries: BufferedEntry[] = [];

  constructor(private readonly options: RecentEntriesOptions) {}

  get size(): number {
    return this.entries.length;
  }

  /** Appends an entry. Entries must come in stream order; an older or equal id is ignored. */
  push(entry: BufferedEntry, now: number): void {
    const newest = this.entries.at(-1);
    if (newest && compareStreamIds(entry.id, newest.id) <= 0) return;
    this.entries.push(entry);
    this.prune(now);
  }

  /**
   * The entries after `lastId`, oldest first (empty when the client is up to date), or null when
   * the buffer cannot prove that nothing between `lastId` and its own entries is missing.
   */
  after(lastId: StreamId, now: number): BufferedEntry[] | null {
    this.prune(now);
    if (now - streamIdTime(lastId) > this.options.maxAgeMs) return null;
    const index = this.indexOf(lastId);
    if (index === -1) return null;
    return this.entries.slice(index + 1);
  }

  clear(): void {
    this.entries = [];
  }

  private prune(now: number): void {
    const oldestAllowed = now - this.options.maxAgeMs;
    let drop = Math.max(0, this.entries.length - this.options.maxEntries);
    while (drop < this.entries.length) {
      const entry = this.entries[drop];
      if (entry === undefined || streamIdTime(entry.id) >= oldestAllowed) break;
      drop += 1;
    }
    if (drop > 0) this.entries = this.entries.slice(drop);
  }

  /** Binary search: the entries are in id order. */
  private indexOf(id: StreamId): number {
    let low = 0;
    let high = this.entries.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const entry = this.entries[mid];
      if (entry === undefined) return -1;
      const order = compareStreamIds(entry.id, id);
      if (order === 0) return mid;
      if (order < 0) low = mid + 1;
      else high = mid - 1;
    }
    return -1;
  }
}
