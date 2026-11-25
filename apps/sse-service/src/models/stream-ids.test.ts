import { describe, expect, it } from "vitest";
import { compareStreamIds, lastEventIdFromHeader, parseStreamId, type StreamId } from "./stream-ids.js";

function id(value: string): StreamId {
  const parsed = parseStreamId(value);
  if (!parsed) throw new Error(`bad test id ${value}`);
  return parsed;
}

describe("parseStreamId", () => {
  it("accepts <digits>-<digits>", () => {
    expect(parseStreamId("1732540000000-0")).toEqual({ raw: "1732540000000-0", ms: 1732540000000n, seq: 0n });
    expect(parseStreamId("0-0")?.raw).toBe("0-0");
  });

  it.each(["", "1", "1-", "-1", "1-2-3", "a-1", "1-a", "$", "+", "-", " 1-1", "1-1 ", "1-1\n", "123456789012345678901-0"])(
    "refuses %j",
    (value) => {
      expect(parseStreamId(value)).toBeNull();
    },
  );
});

describe("compareStreamIds", () => {
  it("orders by time, then sequence, numerically", () => {
    expect(compareStreamIds(id("2-0"), id("10-0"))).toBeLessThan(0);
    expect(compareStreamIds(id("5-10"), id("5-9"))).toBeGreaterThan(0);
    expect(compareStreamIds(id("5-1"), id("5-1"))).toBe(0);
  });
});

describe("lastEventIdFromHeader", () => {
  it("reads one well-formed header and ignores the rest", () => {
    expect(lastEventIdFromHeader(" 7-3 ")?.raw).toBe("7-3");
    expect(lastEventIdFromHeader(undefined)).toBeNull();
    expect(lastEventIdFromHeader(["7-3", "8-0"])).toBeNull();
    expect(lastEventIdFromHeader("$")).toBeNull();
  });
});
