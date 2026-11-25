import { describe, expect, it } from "vitest";
import { centsOf, conditionMet, formatCents } from "./alert.js";

describe("centsOf", () => {
  it("reads whole amounts and one or two decimals without floats", () => {
    expect(centsOf("228.5")).toBe(22850);
    expect(centsOf("228.50")).toBe(22850);
    expect(centsOf("0.01")).toBe(1);
    expect(centsOf("1200")).toBe(120000);
    expect(centsOf("0")).toBe(0);
    // 0.1 + 0.2 territory: still exact.
    expect(centsOf("0.29")).toBe(29);
  });

  it("refuses signs, exponents, extra decimals, leading zeros and junk", () => {
    for (const bad of ["-1", "+1", "1e3", "1.234", "01", "1.", ".5", "", " 1", "1,5", "abc", "1234567890123"]) {
      expect(centsOf(bad)).toBeNull();
    }
  });
});

describe("formatCents", () => {
  it("always gives two decimals", () => {
    expect(formatCents(22850)).toBe("228.50");
    expect(formatCents(1)).toBe("0.01");
    expect(formatCents(120000)).toBe("1200.00");
  });
});

describe("conditionMet", () => {
  it("includes the threshold itself in both directions", () => {
    expect(conditionMet("above", 100, 100)).toBe(true);
    expect(conditionMet("below", 100, 100)).toBe(true);
  });

  it("catches a jump past the threshold", () => {
    expect(conditionMet("above", 100, 150)).toBe(true);
    expect(conditionMet("above", 100, 99)).toBe(false);
    expect(conditionMet("below", 100, 50)).toBe(true);
    expect(conditionMet("below", 100, 101)).toBe(false);
  });
});
