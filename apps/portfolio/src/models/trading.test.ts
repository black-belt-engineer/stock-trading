import { describe, expect, it } from "vitest";
import { centsFromQuote, divideRounded, formatDecimal, parseDecimal, rescale } from "./money.js";
import { fillOrder, STARTING_CASH_CENTS } from "./trading.js";

describe("money", () => {
  it("parses Postgres NUMERIC text at a scale", () => {
    expect(parseDecimal("228.5", 4)).toBe(2_285_000n);
    expect(parseDecimal("100000.00", 2)).toBe(10_000_000n);
    expect(parseDecimal("-12.34", 2)).toBe(-1234n);
    expect(parseDecimal("7", 2)).toBe(700n);
    expect(parseDecimal("1.500000", 4)).toBe(15_000n);
  });

  it("refuses more decimals than the scale holds, and anything not a decimal", () => {
    expect(parseDecimal("1.23456", 4)).toBeNull();
    expect(parseDecimal("1e5", 2)).toBeNull();
    expect(parseDecimal("", 2)).toBeNull();
    expect(parseDecimal("12.", 2)).toBeNull();
    expect(parseDecimal("NaN", 2)).toBeNull();
  });

  it("formats at a scale", () => {
    expect(formatDecimal(2_285_000n, 4)).toBe("228.5000");
    expect(formatDecimal(-5n, 2)).toBe("-0.05");
    expect(formatDecimal(0n, 2)).toBe("0.00");
    expect(formatDecimal(10_000_000n, 2)).toBe("100000.00");
  });

  it("rounds half away from zero", () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
    expect(rescale(12_345n, 4, 2)).toBe(123n);
    expect(rescale(12_350n, 4, 2)).toBe(124n);
    expect(rescale(-12_350n, 4, 2)).toBe(-124n);
    expect(rescale(123n, 2, 4)).toBe(12_300n);
  });

  it("turns a quote's float into whole cents", () => {
    expect(centsFromQuote(228.51)).toBe(22_851n);
    expect(centsFromQuote(0.1 + 0.2)).toBe(30n);
    expect(centsFromQuote(0)).toBeNull();
    expect(centsFromQuote(-1)).toBeNull();
    expect(centsFromQuote(Number.NaN)).toBeNull();
    expect(centsFromQuote(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("fillOrder", () => {
  it("buys into a new position at the fill price", () => {
    const result = fillOrder({ side: "buy", quantity: 10, priceCents: 22_851n, cashCents: STARTING_CASH_CENTS, holding: null });
    expect(result).toEqual({
      ok: true,
      fill: {
        total: 228_510n,
        price: 2_285_100n,
        cashAfter: STARTING_CASH_CENTS - 228_510n,
        holdingAfter: { quantity: 10, avgCost: 2_285_100n },
        realizedPnl: null,
      },
    });
  });

  it("averages the cost on a second buy, rounded to four decimals", () => {
    // (1 × 100.00 + 2 × 100.01) / 3 = 100.006666… → 100.0067
    const result = fillOrder({
      side: "buy",
      quantity: 2,
      priceCents: 10_001n,
      cashCents: 1_000_000n,
      holding: { quantity: 1, avgCost: 1_000_000n },
    });
    expect(result.ok && result.fill.holdingAfter).toEqual({ quantity: 3, avgCost: 1_000_067n });
  });

  it("refuses a buy the cash does not cover, and allows one that spends every cent", () => {
    expect(fillOrder({ side: "buy", quantity: 2, priceCents: 500n, cashCents: 999n, holding: null })).toEqual({
      ok: false,
      reason: "insufficient_cash",
    });
    const exact = fillOrder({ side: "buy", quantity: 2, priceCents: 500n, cashCents: 1_000n, holding: null });
    expect(exact.ok && exact.fill.cashAfter).toBe(0n);
  });

  it("sells part of a position, keeping the average cost and realising P&L", () => {
    const result = fillOrder({
      side: "sell",
      quantity: 4,
      priceCents: 11_000n,
      cashCents: 0n,
      holding: { quantity: 10, avgCost: 1_000_067n },
    });
    // (110.0000 − 100.0067) × 4 = 39.9732 → 39.97
    expect(result).toEqual({
      ok: true,
      fill: {
        total: 44_000n,
        price: 1_100_000n,
        cashAfter: 44_000n,
        holdingAfter: { quantity: 6, avgCost: 1_000_067n },
        realizedPnl: 3_997n,
      },
    });
  });

  it("closes a position sold in full and records a loss as negative", () => {
    const result = fillOrder({
      side: "sell",
      quantity: 3,
      priceCents: 9_000n,
      cashCents: 0n,
      holding: { quantity: 3, avgCost: 1_000_000n },
    });
    expect(result.ok && result.fill.holdingAfter).toBeNull();
    expect(result.ok && result.fill.realizedPnl).toBe(-3_000n);
  });

  it("refuses to sell more than is held, or what is not held (no shorting)", () => {
    const holding = { quantity: 2, avgCost: 1_000_000n };
    expect(fillOrder({ side: "sell", quantity: 3, priceCents: 100n, cashCents: 0n, holding })).toEqual({
      ok: false,
      reason: "insufficient_shares",
    });
    expect(fillOrder({ side: "sell", quantity: 1, priceCents: 100n, cashCents: 0n, holding: null })).toEqual({
      ok: false,
      reason: "insufficient_shares",
    });
  });
});
