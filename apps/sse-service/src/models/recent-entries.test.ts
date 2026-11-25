import { describe, expect, it } from "vitest";
import { RecentEntries, type BufferedEntry } from "./recent-entries.js";
import { parseStreamId, type StreamId } from "./stream-ids.js";

function id(value: string): StreamId {
  const parsed = parseStreamId(value);
  if (!parsed) throw new Error(`bad test id ${value}`);
  return parsed;
}

function entry(value: string, symbol = "AAPL"): BufferedEntry {
  return { id: id(value), symbol, frame: `frame ${value}` };
}

const NOW = 1_000_000;

describe("RecentEntries", () => {
  it("returns the entries after a known id, oldest first", () => {
    const recent = new RecentEntries({ maxEntries: 10, maxAgeMs: 60_000 });
    for (const value of ["999000-0", "999000-1", "999500-0", "999900-0"]) recent.push(entry(value), NOW);
    expect(recent.after(id("999000-1"), NOW)?.map((e) => e.id.raw)).toEqual(["999500-0", "999900-0"]);
    expect(recent.after(id("999900-0"), NOW)).toEqual([]);
  });

  it("refuses an id it does not hold: unknown, trimmed or newer", () => {
    const recent = new RecentEntries({ maxEntries: 2, maxAgeMs: 60_000 });
    for (const value of ["999000-0", "999100-0", "999200-0"]) recent.push(entry(value), NOW);
    expect(recent.size).toBe(2);
    expect(recent.after(id("999000-0"), NOW)).toBeNull();
    expect(recent.after(id("999150-0"), NOW)).toBeNull();
    expect(recent.after(id("999300-0"), NOW)).toBeNull();
    expect(recent.after(id("999100-0"), NOW)?.length).toBe(1);
  });

  it("drops entries older than the age limit and refuses a resume from them", () => {
    const recent = new RecentEntries({ maxEntries: 100, maxAgeMs: 60_000 });
    recent.push(entry(`${NOW - 61_000}-0`), NOW);
    recent.push(entry(`${NOW - 59_000}-0`), NOW);
    expect(recent.size).toBe(1);
    expect(recent.after(id(`${NOW - 59_000}-0`), NOW)).toEqual([]);
    // Time passes: the last entry ages out too.
    expect(recent.after(id(`${NOW - 59_000}-0`), NOW + 2000)).toBeNull();
    expect(recent.size).toBe(0);
  });

  it("ignores an entry that is not newer than the last one", () => {
    const recent = new RecentEntries({ maxEntries: 10, maxAgeMs: 60_000 });
    recent.push(entry("999500-0"), NOW);
    recent.push(entry("999400-0"), NOW);
    recent.push(entry("999500-0"), NOW);
    expect(recent.size).toBe(1);
  });

  it("forgets everything on clear", () => {
    const recent = new RecentEntries({ maxEntries: 10, maxAgeMs: 60_000 });
    recent.push(entry("999500-0"), NOW);
    recent.clear();
    expect(recent.after(id("999500-0"), NOW)).toBeNull();
  });
});
