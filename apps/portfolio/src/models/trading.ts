import { CASH_SCALE, divideRounded, PRICE_SCALE, rescale } from "./money.js";

/** Decided (Q8): every account starts with $100,000, market orders, whole shares, long only, no fees. */
export const STARTING_CASH_CENTS = 10_000_000n;

/** Most shares in one order (owner's decision). More than $100,000 buys of almost any symbol. */
export const MAX_ORDER_QUANTITY = 10_000;

/** An order is refused when the latest price is older than this (owner's decision; ticks come every second). */
export const PRICE_MAX_AGE_MS = 5_000;

/** Most orders one page of `GET /portfolio/orders` returns. */
export const MAX_ORDERS_PAGE = 100;
export const DEFAULT_ORDERS_PAGE = 50;

export type Side = "buy" | "sell";

/** A held position. Rows at zero are deleted, so `quantity` is always at least 1. */
export type Holding = {
  quantity: number;
  /** Scale 4. */
  avgCost: bigint;
};

export type FillInput = {
  side: Side;
  quantity: number;
  /** The fill price, whole cents (the latest price from Redis). */
  priceCents: bigint;
  /** The account's cash before the order, cents. */
  cashCents: bigint;
  /** The position before the order, `null` when none is held. */
  holding: Holding | null;
};

export type Fill = {
  /** Cents. Rounded once, here, and stored; never recomputed from quantity × price later. */
  total: bigint;
  /** The fill price at scale 4, as stored on the order. */
  price: bigint;
  cashAfter: bigint;
  /** `null` when the order closed the position. */
  holdingAfter: Holding | null;
  /** Sells only: `(price − avg_cost) × quantity`, cents. `null` for a buy. */
  realizedPnl: bigint | null;
};

export type FillResult = { ok: true; fill: Fill } | { ok: false; reason: "insufficient_cash" | "insufficient_shares" };

/**
 * Executes a market order against an account, in memory: the caller writes the result inside
 * the transaction that locked the account. Average cost moves on buys only,
 * `(old_qty × old_avg + qty × price) / new_qty` rounded to four decimals; a sell leaves it and
 * realises P&L against it.
 */
export function fillOrder(input: FillInput): FillResult {
  const { side, quantity, priceCents, cashCents, holding } = input;
  const shares = BigInt(quantity);
  const price = rescale(priceCents, CASH_SCALE, PRICE_SCALE);
  // The price is whole cents, so the total is exact; no rounding happens here.
  const total = shares * priceCents;

  if (side === "buy") {
    if (cashCents < total) return { ok: false, reason: "insufficient_cash" };
    const oldShares = BigInt(holding?.quantity ?? 0);
    const newShares = oldShares + shares;
    const avgCost = divideRounded(oldShares * (holding?.avgCost ?? 0n) + shares * price, newShares);
    return {
      ok: true,
      fill: {
        total,
        price,
        cashAfter: cashCents - total,
        holdingAfter: { quantity: (holding?.quantity ?? 0) + quantity, avgCost },
        realizedPnl: null,
      },
    };
  }

  if (!holding || holding.quantity < quantity) return { ok: false, reason: "insufficient_shares" };
  const remaining = holding.quantity - quantity;
  return {
    ok: true,
    fill: {
      total,
      price,
      cashAfter: cashCents + total,
      holdingAfter: remaining === 0 ? null : { quantity: remaining, avgCost: holding.avgCost },
      realizedPnl: rescale((price - holding.avgCost) * shares, PRICE_SCALE, CASH_SCALE),
    },
  };
}

// API shapes. Amounts are decimal strings: cash, totals and P&L with two decimals, prices and
// average cost with four ("228.5100"). The client parses them; it never receives a float.

export type Order = {
  id: string;
  symbol: string;
  side: Side;
  quantity: number;
  /** The fill price, four decimals. */
  price: string;
  /** What the order cost or brought in, two decimals. */
  total: string;
  /** Sells only, two decimals, negative for a loss; `null` for a buy. */
  realizedPnl: string | null;
  clientOrderId: string;
  /** ISO 8601. */
  createdAt: string;
};

export type Position = {
  symbol: string;
  quantity: number;
  /** Four decimals. */
  avgCost: string;
  /** False once the symbol has left the registry: it can no longer be priced live or sold. */
  listed: boolean;
  /**
   * The newest price the server knows, two decimals: Redis's latest, or else the last fill.
   * For a position the stream does not quote (delisted), this is all there is. `null` never
   * happens for a held position in practice, but is allowed.
   */
  lastPrice: string | null;
  /** ISO 8601, when `lastPrice` was traded. */
  lastPriceAt: string | null;
};

/**
 * What the user traded in a symbol during its current market session (M2). The client needs it
 * for day P&L: shares held at the session's start are measured from `previousClose`, shares
 * bought since from their fill price. Symbols without a trade this session are left out.
 */
export type SessionActivity = {
  symbol: string;
  /** The same id as the quote's `sessionId` (`2026-11-25`). */
  sessionId: string;
  boughtQuantity: number;
  soldQuantity: number;
  /** Two decimals. */
  boughtTotal: string;
  /** Two decimals. */
  soldTotal: string;
};

export type AccountResponse = {
  /** Two decimals. */
  cash: string;
  /** Two decimals ("100000.00"): total P&L is cash + market value − this. */
  startingCash: string;
  /** Sum over every sell since the account started or was reset, two decimals. */
  realizedPnl: string;
  /** ISO 8601. */
  createdAt: string;
  /** By symbol. */
  positions: Position[];
  sessionActivity: SessionActivity[];
};

export type OrdersPage = {
  /** Newest first. */
  items: Order[];
  /** Pass as `before` for the next page; `null` on the last page. */
  nextBefore: string | null;
};
