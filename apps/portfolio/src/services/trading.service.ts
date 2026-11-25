import { AppError, ValidationError } from "@stock-platform/errors";
import { sessionIdFor, sessionStartFor, SYMBOL_REGISTRY } from "@stock-platform/symbols";
import { CASH_SCALE, formatDecimal, PRICE_SCALE, rescale } from "../models/money.js";
import { isListed, resolveSymbol } from "../models/symbols.js";
import {
  fillOrder,
  MAX_ORDER_QUANTITY,
  PRICE_MAX_AGE_MS,
  type AccountResponse,
  type Order,
  type OrdersPage,
  type Position,
  type Side,
} from "../models/trading.js";
import type { OrderRow, SessionWindow, TradingRepository } from "../repositories/trading.repository.js";
import type { PriceReader, Quote } from "./price-reader.js";

export type Logger = {
  warn: (obj: object, message: string) => void;
};

export type OrderRequest = {
  symbol: string;
  side: Side;
  quantity: number;
  clientOrderId: string;
};

export type PlacedOrder = {
  order: Order;
  /** False when `clientOrderId` had already been executed: the original order, nothing new ran. */
  created: boolean;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: formatDecimal(row.price, PRICE_SCALE),
    total: formatDecimal(row.total, CASH_SCALE),
    realizedPnl: row.realizedPnl === null ? null : formatDecimal(row.realizedPnl, CASH_SCALE),
    clientOrderId: row.clientOrderId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 503: no price to fill at. Reads of the account keep working. */
function marketDataUnavailable(symbol: string): AppError {
  return new AppError(`Market data for ${symbol} is unavailable, try again shortly`, 503, "MARKET_DATA_UNAVAILABLE");
}

/**
 * P3, paper trading (Q8). The user is always the token's subject. Market orders fill at the
 * latest price in Redis, read by the server inside the order's transaction.
 */
export class TradingService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly prices: PriceReader,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cash, positions with their last known price, and this session's trades. Works without Redis. */
  async account(userId: string): Promise<AccountResponse> {
    const now = this.now();
    // Every registered symbol, so a position opened and closed today still counts in day P&L.
    const sessions: SessionWindow[] = SYMBOL_REGISTRY.map(({ symbol, exchange }) => ({
      symbol,
      start: new Date(sessionStartFor(now, exchange)),
      sessionId: sessionIdFor(now, exchange),
    }));
    const snapshot = await this.repository.snapshot(userId, sessions);
    const quotes = await this.prices.latestMany(snapshot.positions.map((p) => p.symbol)).catch((err: unknown) => {
      this.log.warn({ err }, "Redis unavailable: positions show their last fill price");
      return new Map<string, Quote>();
    });
    const positions: Position[] = snapshot.positions.map((position) => {
      const quote = quotes.get(position.symbol);
      const fill = snapshot.lastFills.get(position.symbol);
      const last = quote
        ? { price: quote.priceCents, at: new Date(quote.at) }
        : fill
          ? { price: rescale(fill.price, PRICE_SCALE, CASH_SCALE), at: fill.at }
          : null;
      return {
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: formatDecimal(position.avgCost, PRICE_SCALE),
        listed: isListed(position.symbol),
        lastPrice: last ? formatDecimal(last.price, CASH_SCALE) : null,
        lastPriceAt: last ? last.at.toISOString() : null,
      };
    });
    return {
      cash: formatDecimal(snapshot.cash, CASH_SCALE),
      startingCash: formatDecimal(this.repository.startingCashCents, CASH_SCALE),
      realizedPnl: formatDecimal(snapshot.realizedPnl, CASH_SCALE),
      createdAt: snapshot.createdAt.toISOString(),
      positions,
      sessionActivity: snapshot.activity.map((a) => ({
        symbol: a.symbol,
        sessionId: a.sessionId,
        boughtQuantity: a.boughtQuantity,
        soldQuantity: a.soldQuantity,
        boughtTotal: formatDecimal(a.boughtTotal, CASH_SCALE),
        soldTotal: formatDecimal(a.soldTotal, CASH_SCALE),
      })),
    };
  }

  async orders(userId: string, limit: number, before: string | null): Promise<OrdersPage> {
    // One more than asked tells whether there is a next page.
    const rows = await this.repository.listOrders(userId, limit + 1, before);
    const items = rows.slice(0, limit).map(toOrder);
    const last = items.at(-1);
    return { items, nextBefore: rows.length > limit && last ? last.id : null };
  }

  /**
   * Executes a market order, all or nothing. `400` malformed, `404` unknown or delisted symbol,
   * `409` not enough cash or shares or a `clientOrderId` reused for a different order, `503` no
   * fresh price. A repeat of an executed `clientOrderId` returns the original order.
   */
  async placeOrder(userId: string, request: OrderRequest): Promise<PlacedOrder> {
    const { symbol } = resolveSymbol(request.symbol);
    const { side, quantity } = request;
    const clientOrderId = request.clientOrderId.toLowerCase();
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
      throw new ValidationError(`quantity must be a whole number from 1 to ${MAX_ORDER_QUANTITY}`);
    }

    return this.repository.withAccount(userId, async (account) => {
      // Checked under the lock: a retry arriving while the first attempt is still running waits
      // for it, then finds its order here.
      const existing = await account.findOrder(clientOrderId);
      if (existing) {
        if (existing.symbol !== symbol || existing.side !== side || existing.quantity !== quantity) {
          throw new AppError("This clientOrderId was already used for a different order", 409, "CLIENT_ORDER_ID_REUSED");
        }
        return { order: toOrder(existing), created: false };
      }

      const quote = await this.prices.latest(symbol).catch((err: unknown) => {
        this.log.warn({ err, symbol }, "Redis unavailable: order refused");
        return null;
      });
      if (!quote || this.now() - quote.at > PRICE_MAX_AGE_MS) {
        throw marketDataUnavailable(symbol);
      }

      const result = fillOrder({
        side,
        quantity,
        priceCents: quote.priceCents,
        cashCents: account.cash,
        holding: await account.holding(symbol),
      });
      if (!result.ok) {
        throw result.reason === "insufficient_cash"
          ? new AppError("Not enough cash for this order", 409, "INSUFFICIENT_FUNDS")
          : new AppError(`You do not hold that many ${symbol} shares`, 409, "INSUFFICIENT_SHARES");
      }
      const row = await account.record({ symbol, side, quantity, clientOrderId }, result.fill);
      return { order: toOrder(row), created: true };
    });
  }

  /** Settings → Reset portfolio: back to the starting cash, with no positions or orders. */
  async reset(userId: string): Promise<AccountResponse> {
    await this.repository.reset(userId);
    return this.account(userId);
  }
}
