import { describe, expect, it } from "vitest";
import { formatMoney, formatPercentOf, formatPrice4, formatSignedMoney, parseDecimal } from "./money";
import { parseAccount } from "./portfolioApi";
import type { Account } from "./portfolioApi";
import { dayPnlOf, valuePortfolio } from "./valuation";
import type { LiveQuote } from "./valuation";

const SESSION = "2026-11-25";

function quote(symbol: string, currentPrice: number | null, previousClose: number | null, sessionId = SESSION): LiveQuote {
  return { symbol, currentPrice, previousClose, sessionId };
}

function account(overrides: Partial<Account> = {}): Account {
  return { cash: 10_000_000n, startingCash: 10_000_000n, realizedPnl: 0n, positions: [], sessionActivity: [], ...overrides };
}

describe("money formatting", () => {
  it("formats cents and signed cents", () => {
    expect(formatMoney(123_456n)).toBe("$1,234.56");
    expect(formatMoney(-5n)).toBe("−$0.05");
    expect(formatSignedMoney(1_230n)).toBe("+$12.30");
    expect(formatSignedMoney(0n)).toBe("$0.00");
  });

  it("shows four decimals only when they carry something", () => {
    expect(formatPrice4(2_285_000n)).toBe("$228.50");
    expect(formatPrice4(2_285_067n)).toBe("$228.5067");
  });

  it("gives a percentage from integers", () => {
    expect(formatPercentOf(125n, 10_000n)).toBe("+1.25%");
    expect(formatPercentOf(-1n, 3n)).toBe("−33.33%");
    expect(formatPercentOf(0n, 3n)).toBe("0.00%");
    expect(formatPercentOf(1n, 0n)).toBeNull();
  });

  it("parses the server's strings", () => {
    expect(parseDecimal("100000.00", 2)).toBe(10_000_000n);
    expect(parseDecimal("1.23456", 4)).toBeNull();
  });
});

describe("parseAccount", () => {
  it("parses decimals into bigint and refuses an account without cash", () => {
    const parsed = parseAccount({
      cash: "96967.20",
      startingCash: "100000.00",
      realizedPnl: "-1.50",
      createdAt: "2026-11-25T10:00:00.000Z",
      positions: [{ symbol: "AAPL", quantity: 10, avgCost: "303.2800", listed: true, lastPrice: "303.30", lastPriceAt: "2026-11-25T10:00:01.000Z" }],
      sessionActivity: [],
    });
    expect(parsed.cash).toBe(9_696_720n);
    expect(parsed.realizedPnl).toBe(-150n);
    expect(parsed.positions[0]?.avgCost).toBe(3_032_800n);
    expect(() => parseAccount({ cash: 100000, startingCash: "1.00", realizedPnl: "0.00", positions: [], sessionActivity: [] })).toThrow();
  });
});

describe("dayPnlOf", () => {
  it("measures shares held since before today from the previous close", () => {
    // 10 × (101 − 100)
    expect(dayPnlOf(10, 10_100n, quote("A", 101, 100), undefined)).toBe(1_000n);
  });

  it("measures a position opened today from its fill price", () => {
    // Bought 10 at 100.50 today; now 101: 10 × 0.50
    const activity = { symbol: "A", sessionId: SESSION, boughtQuantity: 10, soldQuantity: 0, boughtTotal: 100_500n, soldTotal: 0n };
    expect(dayPnlOf(10, 10_100n, quote("A", 101, 90), activity)).toBe(500n);
  });

  it("mixes held shares, a buy and a sell within the session", () => {
    // Held 10 at the start (close 100). Bought 5 at 102, sold 3 at 103. Now 12 at 104.
    // 12×104 − 10×100 + 309 − 510 = 1248 − 1000 − 201 = 47.00
    const activity = { symbol: "A", sessionId: SESSION, boughtQuantity: 5, soldQuantity: 3, boughtTotal: 51_000n, soldTotal: 30_900n };
    expect(dayPnlOf(12, 10_400n, quote("A", 104, 100), activity)).toBe(4_700n);
  });

  it("counts a position opened and closed today", () => {
    const activity = { symbol: "A", sessionId: SESSION, boughtQuantity: 4, soldQuantity: 4, boughtTotal: 40_000n, soldTotal: 40_400n };
    expect(dayPnlOf(0, 10_500n, quote("A", 105, 99), activity)).toBe(400n);
  });

  it("ignores activity from an earlier session", () => {
    const activity = { symbol: "A", sessionId: "2026-11-24", boughtQuantity: 10, soldQuantity: 0, boughtTotal: 100_000n, soldTotal: 0n };
    expect(dayPnlOf(10, 10_100n, quote("A", 101, 100), activity)).toBe(1_000n);
  });

  it("is unknown without a price, or without a previous close for older shares", () => {
    expect(dayPnlOf(10, null, quote("A", null, 100), undefined)).toBeNull();
    expect(dayPnlOf(10, 10_100n, quote("A", 101, null), undefined)).toBeNull();
  });
});

describe("valuePortfolio", () => {
  it("values positions at live prices and reconciles the total P&L", () => {
    const acc = account({
      cash: 9_696_720n,
      positions: [{ symbol: "AAPL", quantity: 10, avgCost: 3_032_800n, listed: true, lastPrice: 30_300n, lastPriceAt: 0 }],
    });
    const value = valuePortfolio(acc, new Map([["AAPL", quote("AAPL", 305, 300)]]));
    const [aapl] = value.positions;
    expect(aapl?.marketValue).toBe(305_000n);
    expect(aapl?.costBasis).toBe(303_280n);
    expect(aapl?.unrealizedPnl).toBe(1_720n);
    expect(aapl?.live).toBe(true);
    expect(value.totalValue).toBe(9_696_720n + 305_000n);
    expect(value.totalPnl).toBe(1_720n);
    expect(value.incomplete).toBe(false);
  });

  it("prices a delisted position at its last known price, with no day P&L", () => {
    const acc = account({
      positions: [{ symbol: "OLD", quantity: 2, avgCost: 1_000_000n, listed: false, lastPrice: 9_000n, lastPriceAt: 0 }],
    });
    const value = valuePortfolio(acc, new Map([["OLD", quote("OLD", 120, 110)]]));
    expect(value.positions[0]?.price).toBe(9_000n);
    expect(value.positions[0]?.live).toBe(false);
    expect(value.positions[0]?.dayPnl).toBeNull();
    expect(value.dayPnl).toBeNull();
  });

  it("includes symbols sold out today in the day P&L, and flags positions without any price", () => {
    const acc = account({
      positions: [{ symbol: "NONE", quantity: 1, avgCost: 10_000n, listed: true, lastPrice: null, lastPriceAt: null }],
      sessionActivity: [{ symbol: "AAPL", sessionId: SESSION, boughtQuantity: 1, soldQuantity: 1, boughtTotal: 10_000n, soldTotal: 10_250n }],
    });
    const value = valuePortfolio(acc, new Map([["AAPL", quote("AAPL", 103, 99)]]));
    expect(value.dayPnl).toBe(250n);
    expect(value.incomplete).toBe(true);
    expect(value.marketValue).toBe(0n);
  });
});
