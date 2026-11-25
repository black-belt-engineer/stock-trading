import { describe, expect, it } from "vitest";
import { isNewerEventId, parseEventId, type EventId } from "./eventIds";

function id(value: string): EventId {
  const parsed = parseEventId(value);
  if (!parsed) throw new Error(`bad test id ${value}`);
  return parsed;
}

describe("parseEventId", () => {
  it("reads Redis stream ids and refuses anything else", () => {
    expect(parseEventId("1732540000000-3")?.seq).toBe(BigInt(3));
    for (const bad of ["", "abc", "1-", "-1", "1-2-3", " 1-2"]) expect(parseEventId(bad)).toBeNull();
  });
});

describe("isNewerEventId", () => {
  it("compares time, then sequence, as numbers", () => {
    expect(isNewerEventId(id("10-0"), id("9-5"))).toBe(true);
    expect(isNewerEventId(id("10-10"), id("10-9"))).toBe(true);
    expect(isNewerEventId(id("10-9"), id("10-9"))).toBe(false);
    expect(isNewerEventId(id("9-9"), id("10-0"))).toBe(false);
    expect(isNewerEventId(id("1-0"), null)).toBe(true);
  });
});
