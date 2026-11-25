import { createLogger } from "@stock-platform/logger";
import type { LatestPrice, StreamQuote } from "@stock-platform/types";
import { streamQuoteFromLatest } from "@stock-platform/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseStreamId, type StreamId } from "../models/stream-ids.js";
import type { RawStreamEntry, StreamReader } from "./redis-stream-reader.js";
import { StreamHub, type StreamSubscriber } from "./stream-hub.service.js";

const log = createLogger("test", { level: "silent" });

function latest(symbol: string, price: number): LatestPrice {
  return {
    symbol,
    name: symbol,
    sessionId: "2026-11-25",
    currentPrice: price,
    previousClose: 100,
    open: 100,
    high: price,
    low: price,
    volume: 10,
    change: price - 100,
    changePercent: price - 100,
    tickDirection: "up",
    lastSize: 5,
    lastSide: "buy",
    lastUpdated: 1,
  };
}

function raw(id: string, symbol: string, price = 101): RawStreamEntry {
  return { id, fields: ["symbol", symbol, "payload", JSON.stringify(latest(symbol, price))] };
}

function sid(value: string): StreamId {
  const parsed = parseStreamId(value);
  if (!parsed) throw new Error(`bad test id ${value}`);
  return parsed;
}

type PendingRead = { afterId: string; resolve: (entries: RawStreamEntry[]) => void; reject: (err: Error) => void };

/** A reader whose blocking reads are answered by the test. */
class FakeReader implements StreamReader {
  readonly pending: PendingRead[] = [];
  closed = false;
  failLatest = 0;
  private listener: (connected: boolean) => void = () => {};

  constructor(public latest: RawStreamEntry[] = []) {}

  async readLatest(count: number): Promise<RawStreamEntry[]> {
    if (this.failLatest > 0) {
      this.failLatest -= 1;
      throw new Error("Redis is down");
    }
    return this.latest.slice(-count);
  }

  readAfter(afterId: string): Promise<RawStreamEntry[]> {
    return new Promise((resolve, reject) => this.pending.push({ afterId, resolve, reject }));
  }

  onConnectionChange(listener: (connected: boolean) => void): void {
    this.listener = listener;
  }

  close(): void {
    this.closed = true;
    for (const read of this.pending.splice(0)) read.reject(new Error("Connection is closed."));
  }

  /** Answers the read in flight. */
  answer(entries: RawStreamEntry[]): string {
    const read = this.pending.shift();
    if (!read) throw new Error("no read in flight");
    read.resolve(entries);
    return read.afterId;
  }

  fail(): void {
    const read = this.pending.shift();
    if (!read) throw new Error("no read in flight");
    read.reject(new Error("read failed"));
  }

  setConnected(connected: boolean): void {
    this.listener(connected);
  }
}

class FakeSubscriber implements StreamSubscriber {
  readonly frames: string[] = [];
  ended = false;
  readonly symbols: ReadonlySet<string>;
  constructor(symbols: string[]) {
    this.symbols = new Set(symbols);
  }
  send(frame: string): void {
    this.frames.push(frame);
  }
  end(): void {
    this.ended = true;
  }
  /** `price:<id>` and `snapshot:<symbol>` for each frame. */
  get summary(): string[] {
    return this.frames.map((frame) => {
      const idLine = /^id: (\S+)\n/.exec(frame);
      if (idLine) return `price:${idLine[1]}`;
      const symbol = /"symbol":"([^"]+)"/.exec(frame);
      return `snapshot:${symbol?.[1] ?? "?"}`;
    });
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function setup(options: { latest?: RawStreamEntry[]; now?: () => number; loadQuotes?: (s: readonly string[]) => Promise<StreamQuote[]> } = {}) {
  const readers: FakeReader[] = [];
  const snapshotCalls: string[][] = [];
  const hub = new StreamHub({
    openReader: () => {
      const reader = new FakeReader(options.latest ?? []);
      readers.push(reader);
      return reader;
    },
    loadQuotes:
      options.loadQuotes ??
      (async (symbols) => {
        snapshotCalls.push([...symbols]);
        return symbols.map((symbol) => streamQuoteFromLatest(latest(symbol, 100)));
      }),
    log,
    now: options.now ?? (() => 1_000_000),
  });
  const reader = (): FakeReader => {
    const last = readers.at(-1);
    if (!last) throw new Error("no reader opened");
    return last;
  };
  return { hub, readers, reader, snapshotCalls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StreamHub", () => {
  it("opens one reader for many subscribers and sends each entry only to its symbol's subscribers", async () => {
    const { hub, readers, reader } = setup();
    const subs = Array.from({ length: 100 }, (_, i) => new FakeSubscriber([i % 2 === 0 ? "AAPL" : "MSFT"]));
    for (const sub of subs) hub.subscribe(sub, null);
    await flush();
    expect(readers).toHaveLength(1);

    reader().answer([raw("999000-0", "AAPL"), raw("999000-1", "MSFT")]);
    await flush();
    const aapl = subs[0];
    const msft = subs[1];
    expect(aapl?.summary).toEqual(["snapshot:AAPL", "price:999000-0"]);
    expect(msft?.summary).toEqual(["snapshot:MSFT", "price:999000-1"]);
    // Serialised once: every AAPL subscriber got the very same string.
    expect(new Set(subs.filter((_, i) => i % 2 === 0).map((s) => s.frames[1])).size).toBe(1);
    expect(hub.stats().subscribers).toBe(100);
  });

  it("starts reading at the stream's last id taken before the snapshot, and queues ticks during it", async () => {
    let releaseSnapshot: () => void = () => {};
    const { hub, reader } = setup({
      latest: [raw("990000-0", "AAPL")],
      loadQuotes: (symbols) =>
        new Promise((resolve) => {
          releaseSnapshot = () => resolve(symbols.map((s) => streamQuoteFromLatest(latest(s, 100))));
        }),
    });
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, null);
    await flush();
    expect(reader().answer([raw("990001-0", "AAPL")])).toBe("990000-0");
    await flush();
    expect(sub.frames).toEqual([]);
    releaseSnapshot();
    await flush();
    expect(sub.summary).toEqual(["snapshot:AAPL", "price:990001-0"]);
    expect(reader().pending[0]?.afterId).toBe("990001-0");
  });

  it("resumes from the primed buffer, without a snapshot, filtered to the subscriber's symbols", async () => {
    const { hub, reader, snapshotCalls } = setup({
      latest: [raw("999000-0", "AAPL"), raw("999001-0", "MSFT"), raw("999002-0", "AAPL"), raw("999003-0", "AAPL")],
    });
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, sid("999000-0"));
    await flush();
    expect(sub.summary).toEqual(["price:999002-0", "price:999003-0"]);
    expect(snapshotCalls).toEqual([]);
    reader().answer([raw("999004-0", "AAPL")]);
    await flush();
    expect(sub.summary.at(-1)).toBe("price:999004-0");
  });

  it("sends a snapshot when the last id is unknown, too old or malformed upstream", async () => {
    const { hub } = setup({ latest: [raw("999000-0", "AAPL")] });
    const unknown = new FakeSubscriber(["AAPL"]);
    const old = new FakeSubscriber(["AAPL"]);
    hub.subscribe(unknown, sid("999999-9"));
    hub.subscribe(old, sid("100-0"));
    await flush();
    expect(unknown.summary).toEqual(["snapshot:AAPL"]);
    expect(old.summary).toEqual(["snapshot:AAPL"]);
  });

  it("an up-to-date client gets nothing replayed and no snapshot", async () => {
    const { hub, snapshotCalls } = setup({ latest: [raw("999000-0", "AAPL")] });
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, sid("999000-0"));
    await flush();
    expect(sub.frames).toEqual([]);
    expect(snapshotCalls).toEqual([]);
  });

  it("keeps the reader while a subscriber joins before the read returns, and stops it after the last leaves", async () => {
    const { hub, readers, reader } = setup();
    const unsubscribeA = hub.subscribe(new FakeSubscriber(["AAPL"]), null);
    await flush();
    unsubscribeA();
    hub.subscribe(new FakeSubscriber(["AAPL"]), null);
    reader().answer([]);
    await flush();
    expect(readers).toHaveLength(1);
    expect(reader().closed).toBe(false);
    expect(reader().pending).toHaveLength(1);
  });

  it("stops the reader once nobody is subscribed and opens a new one for the next subscriber", async () => {
    const { hub, readers, reader } = setup();
    const unsubscribe = hub.subscribe(new FakeSubscriber(["AAPL"]), null);
    await flush();
    unsubscribe();
    reader().answer([raw("999000-0", "AAPL")]);
    await flush();
    expect(reader().closed).toBe(true);
    expect(hub.stats().reader).toBe("stopped");

    hub.subscribe(new FakeSubscriber(["AAPL"]), null);
    await flush();
    expect(readers).toHaveLength(2);
    expect(readers.filter((r) => !r.closed)).toHaveLength(1);
  });

  it("keeps delivering when one subscriber throws", async () => {
    const { hub, reader } = setup();
    const bad = new FakeSubscriber(["AAPL"]);
    bad.send = () => {
      throw new Error("socket gone");
    };
    const good = new FakeSubscriber(["AAPL"]);
    hub.subscribe(bad, null);
    hub.subscribe(good, null);
    await flush();
    reader().answer([raw("999000-0", "AAPL")]);
    await flush();
    expect(good.summary).toEqual(["snapshot:AAPL", "price:999000-0"]);
  });

  it("tolerates a subscriber leaving while an entry is being dispatched", async () => {
    const { hub, reader } = setup();
    const first = new FakeSubscriber(["AAPL"]);
    const second = new FakeSubscriber(["AAPL"]);
    let unsubscribeSecond: () => void = () => {};
    first.send = (frame) => {
      first.frames.push(frame);
      if (frame.startsWith("id:")) unsubscribeSecond();
    };
    hub.subscribe(first, null);
    unsubscribeSecond = hub.subscribe(second, null);
    await flush();
    reader().answer([raw("999000-0", "AAPL")]);
    await flush();
    expect(second.summary).toEqual(["snapshot:AAPL"]);
    expect(hub.stats().subscribers).toBe(1);
  });

  it("after a reconnect sends every subscriber a snapshot and forgets the resume buffer", async () => {
    let now = 1_000_000;
    const { hub, reader } = setup({ latest: [raw("999000-0", "AAPL")], now: () => now });
    const sub = new FakeSubscriber(["AAPL", "MSFT"]);
    hub.subscribe(sub, null);
    await flush();
    reader().setConnected(false);
    expect(hub.stats().reader).toBe("disconnected");
    now += 10_000;
    expect(hub.isReaderHealthy()).toBe(true);
    now += 1;
    expect(hub.isReaderHealthy()).toBe(false);
    reader().setConnected(true);
    await flush();
    expect(hub.isReaderHealthy()).toBe(true);
    expect(sub.summary).toEqual(["snapshot:AAPL", "snapshot:MSFT", "snapshot:AAPL", "snapshot:MSFT"]);

    const resumed = new FakeSubscriber(["AAPL"]);
    hub.subscribe(resumed, sid("999000-0"));
    await flush();
    expect(resumed.summary).toEqual(["snapshot:AAPL"]);
  });

  it("retries a failed read with backoff and then resyncs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { hub, reader, snapshotCalls } = setup();
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, null);
    await flush();
    reader().fail();
    await flush();
    expect(reader().pending).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(reader().pending).toHaveLength(1);
    reader().answer([]);
    await flush();
    expect(snapshotCalls).toHaveLength(2);
  });

  it("keeps a new subscriber waiting while priming fails, then starts it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const readers: FakeReader[] = [];
    const hub = new StreamHub({
      openReader: () => {
        const reader = new FakeReader([raw("999000-0", "AAPL")]);
        reader.failLatest = 2;
        readers.push(reader);
        return reader;
      },
      loadQuotes: async (symbols) => symbols.map((s) => streamQuoteFromLatest(latest(s, 100))),
      log,
      now: () => 1_000_000,
    });
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, sid("999000-0"));
    await flush();
    expect(sub.frames).toEqual([]);
    await vi.advanceTimersByTimeAsync(500 + 1000);
    await flush();
    expect(sub.frames).toEqual([]);
    expect(readers[0]?.pending).toHaveLength(1);
  });

  it("ends a stream whose snapshot cannot be loaded", async () => {
    const { hub } = setup({ loadQuotes: async () => Promise.reject(new Error("Redis is down")) });
    const sub = new FakeSubscriber(["AAPL"]);
    hub.subscribe(sub, null);
    await flush();
    expect(sub.ended).toBe(true);
    expect(hub.stats().subscribers).toBe(0);
  });

  it("on close ends every stream and closes the reader", async () => {
    const { hub, reader } = setup();
    const subs = [new FakeSubscriber(["AAPL"]), new FakeSubscriber(["MSFT"])];
    for (const sub of subs) hub.subscribe(sub, null);
    await flush();
    await hub.close();
    expect(subs.every((s) => s.ended)).toBe(true);
    expect(reader().closed).toBe(true);
    const late = new FakeSubscriber(["AAPL"]);
    hub.subscribe(late, null);
    expect(late.ended).toBe(true);
  });
});
