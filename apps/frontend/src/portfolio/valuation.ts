import { CASH_SCALE, centsFromPrice, PRICE_SCALE, rescale } from "./money";
import type { Account, Position, SessionActivity } from "./portfolioApi";

/** What the valuation needs of a live quote (an `ActiveStock`). */
export type LiveQuote = {
  symbol: string;
  currentPrice: number | null;
  previousClose: number | null;
  sessionId: string | null;
};

export type PositionValue = {
  position: Position;
  /** Cents: the live price, else the server's last known price. `null`: no price at all. */
  price: bigint | null;
  /** True when `price` is live from the stream. */
  live: boolean;
  /** Cents. `null` without a price. */
  marketValue: bigint | null;
  /** Cents: quantity × average cost, rounded. */
  costBasis: bigint;
  /** Cents: market value − cost basis. */
  unrealizedPnl: bigint | null;
  /** Cents. `null` when it cannot be known (no live price, or no previous close for shares held since before today). */
  dayPnl: bigint | null;
};

export type PortfolioValue = {
  cash: bigint;
  /** Cents, over the positions with a price. */
  marketValue: bigint;
  /** Cash + market value. */
  totalValue: bigint;
  /** Total value − starting cash: realised and unrealised together. */
  totalPnl: bigint;
  /** Cents, or `null` when no symbol's day P&L is known. */
  dayPnl: bigint | null;
  /** Some positions had no price, so the totals leave them out. */
  incomplete: boolean;
  positions: PositionValue[];
};

/**
 * One symbol's P&L for the current session (P3, brief): shares held at the session's start are
 * measured from `previousClose`, shares bought since from their fill price, and today's sells
 * count at their fill price. In one formula:
 *
 *   day = held_now × price − held_at_start × previous_close + sold_today − bought_today
 *
 * which also covers a position opened and closed within the session (held_now = 0). Activity
 * from another session than the quote's (the session rolled over since the account was loaded)
 * is ignored: those trades are all before the current session.
 */
export function dayPnlOf(
  heldNow: number,
  priceCents: bigint | null,
  quote: LiveQuote | undefined,
  activity: SessionActivity | undefined,
): bigint | null {
  if (priceCents === null || quote === undefined) return null;
  const today = activity && activity.sessionId === quote.sessionId ? activity : undefined;
  const bought = today?.boughtQuantity ?? 0;
  const sold = today?.soldQuantity ?? 0;
  const heldAtStart = heldNow - bought + sold;
  const netCash = (today?.soldTotal ?? 0n) - (today?.boughtTotal ?? 0n);
  let startValue = 0n;
  if (heldAtStart > 0) {
    const previousClose = centsFromPrice(quote.previousClose);
    if (previousClose === null) return null;
    startValue = BigInt(heldAtStart) * previousClose;
  }
  return BigInt(heldNow) * priceCents - startValue + netCash;
}

/**
 * Values the account at live prices. The server stores cash, quantities and average cost; the
 * client only adds the market's side, which moves every second.
 */
export function valuePortfolio(account: Account, quotes: ReadonlyMap<string, LiveQuote>): PortfolioValue {
  const activityBySymbol = new Map(account.sessionActivity.map((a) => [a.symbol, a]));
  const held = new Set(account.positions.map((p) => p.symbol));

  const positions = account.positions.map((position): PositionValue => {
    const quote = position.listed ? quotes.get(position.symbol) : undefined;
    const livePrice = centsFromPrice(quote?.currentPrice ?? null);
    const price = livePrice ?? position.lastPrice;
    const shares = BigInt(position.quantity);
    const costBasis = rescale(shares * position.avgCost, PRICE_SCALE, CASH_SCALE);
    const marketValue = price === null ? null : shares * price;
    return {
      position,
      price,
      live: livePrice !== null,
      marketValue,
      costBasis,
      unrealizedPnl: marketValue === null ? null : marketValue - costBasis,
      // Only a live price says how the day went; a delisted symbol has none.
      dayPnl: livePrice === null ? null : dayPnlOf(position.quantity, livePrice, quote, activityBySymbol.get(position.symbol)),
    };
  });

  let dayPnl: bigint | null = null;
  const addDay = (value: bigint | null): void => {
    if (value !== null) dayPnl = (dayPnl ?? 0n) + value;
  };
  positions.forEach((p) => addDay(p.dayPnl));
  // Symbols sold out during this session still made or lost money today.
  for (const activity of account.sessionActivity) {
    if (held.has(activity.symbol)) continue;
    const quote = quotes.get(activity.symbol);
    addDay(dayPnlOf(0, centsFromPrice(quote?.currentPrice ?? null), quote, activity));
  }

  const marketValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0n), 0n);
  const totalValue = account.cash + marketValue;
  return {
    cash: account.cash,
    marketValue,
    totalValue,
    totalPnl: totalValue - account.startingCash,
    dayPnl,
    incomplete: positions.some((p) => p.price === null),
    positions,
  };
}
