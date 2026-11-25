import { describe, expect, it, vi } from "vitest";
import type { AlertLists, AlertsApi, PriceAlert, TriggerResult } from "./alertsApi";
import { AlertsStore, TRIGGER_RETRY_MS } from "./alertsStore";
import { centsOf, conditionMet, formatCents, formatCentsAsPrice, parseThresholdInput, priceToCents } from "./money";

function alert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: "a1",
    symbol: "AAPL",
    direction: "above",
    threshold: "230.00",
    createdAt: 1000,
    triggeredAt: null,
    triggeredPrice: null,
    listed: true,
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeApi(lists: AlertLists, overrides: Partial<AlertsApi> = {}): AlertsApi {
  return {
    load: async () => lists,
    create: async () => ({ ok: false, reason: "failed", message: "no" }),
    remove: async () => "ok",
    trigger: async (id, price) => ({
      kind: "confirmed",
      first: true,
      alert: alert({ id, triggeredAt: 5000, triggeredPrice: price }),
    }),
    ...overrides,
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const prices = (entries: Record<string, number>): Map<string, { price: number }> =>
  new Map(Object.entries(entries).map(([symbol, price]) => [symbol, { price }]));

describe("money", () => {
  it("parses and formats amounts without floats", () => {
    expect(centsOf("228.5")).toBe(22850);
    expect(centsOf("1.234")).toBeNull();
    expect(formatCents(22850)).toBe("228.50");
    expect(formatCentsAsPrice(120005)).toBe("$1,200.05");
    // 0.29 * 100 is 28.999999999999996 as a float.
    expect(priceToCents(0.29)).toBe(29);
  });

  it("compares with >= and <=", () => {
    expect(conditionMet("above", 100, 100)).toBe(true);
    expect(conditionMet("above", 100, 99)).toBe(false);
    expect(conditionMet("below", 100, 100)).toBe(true);
    expect(conditionMet("below", 100, 101)).toBe(false);
  });

  it("reads what the user typed", () => {
    expect(parseThresholdInput(" $1,200.5 ")).toEqual({ ok: true, cents: 120050 });
    expect(parseThresholdInput("")).toMatchObject({ ok: false });
    expect(parseThresholdInput("0")).toMatchObject({ ok: false, message: "The price must be above zero" });
    expect(parseThresholdInput("-5")).toMatchObject({ ok: false });
    expect(parseThresholdInput("1.005")).toMatchObject({ ok: false });
    expect(parseThresholdInput("abc")).toMatchObject({ ok: false });
  });
});

describe("AlertsStore", () => {
  it("fires an alert once when the price reaches the threshold, and only if the server says first", async () => {
    const onFired = vi.fn();
    const trigger = vi.fn(fakeApi({ active: [], history: [] }).trigger);
    const store = new AlertsStore(fakeApi({ active: [alert()], history: [] }, { trigger }), { onFired });
    await store.load();

    store.evaluate(prices({ AAPL: 229.99 }));
    expect(trigger).not.toHaveBeenCalled();

    store.evaluate(prices({ AAPL: 230 }));
    // A second tick before the answer does not call again.
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith("a1", "230.00");
    expect(onFired).toHaveBeenCalledTimes(1);
    const snap = store.getSnapshot();
    expect(snap.active).toEqual([]);
    expect(snap.history.map((a) => a.id)).toEqual(["a1"]);
    expect(snap.toasts.map((t) => t.alert.id)).toEqual(["a1"]);

    store.evaluate(prices({ AAPL: 240 }));
    await flush();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("catches a jump past the threshold and a below alert", async () => {
    const trigger = vi.fn(fakeApi({ active: [], history: [] }).trigger);
    const store = new AlertsStore(
      fakeApi({ active: [alert(), alert({ id: "b", symbol: "KO", direction: "below", threshold: "60" })], history: [] }, { trigger }),
    );
    await store.load();
    store.evaluate(prices({ AAPL: 250.37, KO: 59.1 }));
    await flush();
    expect(trigger.mock.calls).toEqual([
      ["a1", "250.37"],
      ["b", "59.10"],
    ]);
  });

  it("moves an alert to history without a toast when another tab was first", async () => {
    const onFired = vi.fn();
    const trigger = async (): Promise<TriggerResult> => ({
      kind: "confirmed",
      first: false,
      alert: alert({ triggeredAt: 4000, triggeredPrice: "230.10" }),
    });
    const store = new AlertsStore(fakeApi({ active: [alert()], history: [] }, { trigger }), { onFired });
    await store.load();
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    expect(onFired).not.toHaveBeenCalled();
    expect(store.getSnapshot().toasts).toEqual([]);
    expect(store.getSnapshot().history.map((a) => a.triggeredPrice)).toEqual(["230.10"]);
  });

  it("drops an alert deleted elsewhere silently (404)", async () => {
    const store = new AlertsStore(fakeApi({ active: [alert()], history: [] }, { trigger: async () => ({ kind: "gone" }) }));
    await store.load();
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    const snap = store.getSnapshot();
    expect(snap.active).toEqual([]);
    expect(snap.history).toEqual([]);
    expect(snap.notice).toBeNull();
  });

  it("retries a failed trigger only after a pause", async () => {
    let now = 10_000;
    const trigger = vi.fn(async (): Promise<TriggerResult> => ({ kind: "failed" }));
    const store = new AlertsStore(fakeApi({ active: [alert()], history: [] }, { trigger }), { now: () => now });
    await store.load();
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    expect(trigger).toHaveBeenCalledTimes(1);
    now += TRIGGER_RETRY_MS;
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().active).toHaveLength(1);
  });

  it("ignores a reload that started before a trigger answered", async () => {
    const slowLoad = deferred<AlertLists>();
    let loads = 0;
    const api = fakeApi({ active: [], history: [] }, {
      load: async () => {
        loads += 1;
        return loads === 1 ? { active: [alert()], history: [] } : slowLoad.promise;
      },
    });
    const store = new AlertsStore(api);
    await store.load();
    const reload = store.load();
    store.evaluate(prices({ AAPL: 231 }));
    await flush();
    // The reload answers with the alert still active, from before the trigger.
    slowLoad.resolve({ active: [alert()], history: [] });
    await reload;
    expect(store.getSnapshot().active).toEqual([]);
    expect(store.getSnapshot().history).toHaveLength(1);
  });

  it("rolls a refused delete back with a notice", async () => {
    const store = new AlertsStore(fakeApi({ active: [alert()], history: [] }, { remove: async () => "failed" }));
    await store.load();
    const removing = store.remove("a1");
    expect(store.getSnapshot().active).toEqual([]);
    await removing;
    expect(store.getSnapshot().active.map((a) => a.id)).toEqual(["a1"]);
    expect(store.getSnapshot().notice).toContain("AAPL");
  });

  it("adds a created alert to the active list and checks it", async () => {
    const created = alert({ id: "new", threshold: "100.00" });
    const trigger = vi.fn(fakeApi({ active: [], history: [] }).trigger);
    const store = new AlertsStore(
      fakeApi({ active: [], history: [] }, { create: async () => ({ ok: true, alert: created }), trigger }),
    );
    await store.load();
    const result = await store.create({ symbol: "AAPL", direction: "above", threshold: "100.00" });
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().active.map((a) => a.id)).toEqual(["new"]);
    store.evaluate(prices({ AAPL: 150 }));
    await flush();
    expect(trigger).toHaveBeenCalledWith("new", "150.00");
  });

  it("counts triggers newer than the last bell opening as unseen", async () => {
    let stored = 3000;
    const history = [alert({ id: "old", triggeredAt: 2000 }), alert({ id: "new", triggeredAt: 4000 })];
    const store = new AlertsStore(fakeApi({ active: [], history }), {
      seenStore: { read: () => stored, write: (at) => (stored = at) },
    });
    await store.load();
    expect(store.getSnapshot().unseen).toBe(1);
    expect(store.getSnapshot().history.map((a) => a.id)).toEqual(["new", "old"]);
    store.markSeen();
    expect(store.getSnapshot().unseen).toBe(0);
    expect(stored).toBe(4000);
  });

  it("keeps the last known alerts when a reload fails", async () => {
    let fail = false;
    const store = new AlertsStore(
      fakeApi({ active: [], history: [] }, {
        load: async () => {
          if (fail) throw new Error("down");
          return { active: [alert()], history: [] };
        },
      }),
    );
    await store.load();
    fail = true;
    await store.load();
    expect(store.getSnapshot().status).toBe("unavailable");
    expect(store.getSnapshot().active).toHaveLength(1);
  });
});
