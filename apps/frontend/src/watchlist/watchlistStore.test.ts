import { describe, expect, it } from "vitest";
import type { WatchlistApi, WatchlistEntry, WriteResult } from "./watchlistApi";
import { effectiveItems, moveSymbol, WatchlistStore } from "./watchlistStore";

type Call = { op: "add" | "remove" | "order"; arg: string; resolve: (r: WriteResult) => void };

/** An API whose answers the test releases one by one. */
function fakeApi(initial: WatchlistEntry[] = []) {
  const calls: Call[] = [];
  let list = initial;
  let loadFails = false;
  const pending = (op: Call["op"], arg: string) =>
    new Promise<WriteResult>((resolve) => {
      calls.push({ op, arg, resolve });
    });
  const api: WatchlistApi = {
    load: async () => {
      if (loadFails) throw new Error("down");
      return list;
    },
    add: (s) => pending("add", s),
    remove: (s) => pending("remove", s),
    saveOrder: (symbols) => pending("order", symbols.join(",")),
  };
  return {
    api,
    calls,
    setList: (next: WatchlistEntry[]) => {
      list = next;
    },
    failLoads: (fail: boolean) => {
      loadFails = fail;
    },
  };
}

const entry = (symbol: string): WatchlistEntry => ({ symbol, listed: true });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const symbols = (store: WatchlistStore) => store.getSnapshot().items.map((e) => e.symbol).join(",");

describe("effectiveItems and moveSymbol", () => {
  it("applies pending adds, removes and order", () => {
    const desired = new Map([["KO", false], ["V", true]]);
    expect(effectiveItems([entry("AAPL"), entry("KO")], desired, null).map((e) => e.symbol)).toEqual(["AAPL", "V"]);
    expect(effectiveItems([entry("AAPL"), entry("KO")], new Map(), ["KO", "AAPL"]).map((e) => e.symbol)).toEqual(["KO", "AAPL"]);
  });

  it("moves within bounds", () => {
    expect(moveSymbol(["A", "B", "C"], "C", -1)).toEqual(["A", "C", "B"]);
    expect(moveSymbol(["A", "B", "C"], "A", -1)).toEqual(["A", "B", "C"]);
    expect(moveSymbol(["A", "B", "C"], "A", 5)).toEqual(["B", "C", "A"]);
  });
});

describe("WatchlistStore", () => {
  it("stars at once and keeps it when the server agrees", async () => {
    const fake = fakeApi([entry("AAPL")]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.toggle("KO");
    expect(store.isStarred("KO")).toBe(true);
    fake.calls[0]?.resolve("ok");
    await flush();
    expect(symbols(store)).toBe("AAPL,KO");
    expect(fake.calls).toHaveLength(1);
  });

  it("does nothing before the list has loaded or while it is unavailable", async () => {
    const fake = fakeApi();
    fake.failLoads(true);
    const store = new WatchlistStore(fake.api);
    store.toggle("KO");
    await store.load();
    expect(store.getSnapshot().status).toBe("unavailable");
    store.toggle("KO");
    expect(fake.calls).toHaveLength(0);
    expect(store.isStarred("KO")).toBe(false);
  });

  it("sends a double-click's add and remove in order, one at a time", async () => {
    const fake = fakeApi();
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.toggle("KO");
    store.toggle("KO");
    expect(store.isStarred("KO")).toBe(false);
    expect(fake.calls.map((c) => c.op)).toEqual(["add"]);
    fake.calls[0]?.resolve("ok");
    await flush();
    expect(fake.calls.map((c) => c.op)).toEqual(["add", "remove"]);
    fake.calls[1]?.resolve("ok");
    await flush();
    expect(symbols(store)).toBe("");
    expect(fake.calls).toHaveLength(2);
  });

  it("collapses a triple click into the add only", async () => {
    const fake = fakeApi();
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.toggle("KO");
    store.toggle("KO");
    store.toggle("KO");
    fake.calls[0]?.resolve("ok");
    await flush();
    expect(fake.calls).toHaveLength(1);
    expect(store.isStarred("KO")).toBe(true);
  });

  it("rolls back with a notice when the server refuses", async () => {
    const fake = fakeApi([entry("AAPL")]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.toggle("KO");
    fake.calls[0]?.resolve("full");
    await flush();
    expect(store.isStarred("KO")).toBe(false);
    expect(store.getSnapshot().notice).toMatch(/full/);
    store.toggle("AAPL");
    expect(store.isStarred("AAPL")).toBe(false);
    fake.calls[1]?.resolve("failed");
    await flush();
    expect(store.isStarred("AAPL")).toBe(true);
    expect(store.getSnapshot().notice).toMatch(/Could not remove AAPL/);
    store.dismissNotice();
    expect(store.getSnapshot().notice).toBeNull();
  });

  it("becomes read-only when a failed write's reload fails too", async () => {
    const fake = fakeApi([entry("AAPL")]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    fake.failLoads(true);
    store.toggle("KO");
    fake.calls[0]?.resolve("failed");
    await flush();
    await flush();
    expect(store.getSnapshot().status).toBe("unavailable");
    expect(symbols(store)).toBe("AAPL");
  });

  it("takes another device's changes on reload", async () => {
    const fake = fakeApi([entry("AAPL")]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    fake.setList([entry("AAPL"), entry("TSLA")]);
    await store.load();
    expect(symbols(store)).toBe("AAPL,TSLA");
  });

  it("ignores a reload that started before a write was confirmed", async () => {
    const fake = fakeApi([]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.toggle("KO");
    const reload = store.load(); // answers with the old list (no KO)
    fake.calls[0]?.resolve("ok");
    await flush();
    await reload;
    expect(store.isStarred("KO")).toBe(true);
  });

  it("moves at once and saves the order; a failure restores the server's order", async () => {
    const fake = fakeApi([entry("A"), entry("B"), entry("C")]);
    const store = new WatchlistStore(fake.api);
    await store.load();
    store.move("C", -2);
    expect(symbols(store)).toBe("C,A,B");
    store.move("A", 1); // while the first save is on its way
    expect(symbols(store)).toBe("C,B,A");
    fake.calls[0]?.resolve("ok");
    await flush();
    expect(fake.calls.map((c) => c.arg)).toEqual(["C,A,B", "C,B,A"]);
    fake.calls[1]?.resolve("ok");
    await flush();
    expect(symbols(store)).toBe("C,B,A");

    fake.setList([entry("C"), entry("B"), entry("A")]);
    store.move("A", -1);
    fake.calls[2]?.resolve("failed");
    await flush();
    await flush();
    expect(symbols(store)).toBe("C,B,A");
    expect(store.getSnapshot().notice).toMatch(/order/);
  });
});
