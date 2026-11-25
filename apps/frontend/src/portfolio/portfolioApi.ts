import { apiFetch, LoggedOutError } from "../api";
import type { ApiFetch } from "../api/client";
import { isRecord } from "../utils/guards";
import { CASH_SCALE, parseDecimal, PRICE_SCALE } from "./money";

export type Side = "buy" | "sell";

/** Same as the server's `MAX_ORDER_QUANTITY`. Checked here only to say so before sending. */
export const MAX_ORDER_QUANTITY = 10_000;

/** One executed order. Amounts are parsed from the server's decimal strings, never floats. */
export type Order = {
  id: string;
  symbol: string;
  side: Side;
  quantity: number;
  /** Scale 4. */
  price: bigint;
  /** Cents. */
  total: bigint;
  /** Cents; sells only. */
  realizedPnl: bigint | null;
  clientOrderId: string;
  /** Epoch ms. */
  createdAt: number;
};

export type Position = {
  symbol: string;
  quantity: number;
  /** Scale 4. */
  avgCost: bigint;
  /** False once the symbol left the registry: untradeable, no live price. */
  listed: boolean;
  /** Cents: the server's newest price (Redis, else the last fill). */
  lastPrice: bigint | null;
  /** Epoch ms. */
  lastPriceAt: number | null;
};

/** This session's trades in one symbol (for day P&L). */
export type SessionActivity = {
  symbol: string;
  sessionId: string;
  boughtQuantity: number;
  soldQuantity: number;
  /** Cents. */
  boughtTotal: bigint;
  /** Cents. */
  soldTotal: bigint;
};

export type Account = {
  /** Cents. */
  cash: bigint;
  /** Cents. */
  startingCash: bigint;
  /** Cents. */
  realizedPnl: bigint;
  positions: Position[];
  sessionActivity: SessionActivity[];
};

export type OrdersPage = { items: Order[]; nextBefore: string | null };

export type OrderRequest = { symbol: string; side: Side; quantity: number; clientOrderId: string };

/**
 * How an order ended. `filled`: executed now, or earlier under the same `clientOrderId`
 * (`replayed`). `refused`: the server said no (not enough cash or shares, no fresh price, a bad
 * value): sending it again as it is will not help. `failed`: no answer, or a server error: the
 * same order with the same id may be sent again safely. `loggedOut`: the route guard takes over.
 */
export type OrderResult =
  | { kind: "filled"; order: Order; replayed: boolean }
  | { kind: "refused"; code: string; message: string }
  | { kind: "failed"; message: string }
  | { kind: "loggedOut" };

export type PortfolioApi = {
  /** Throws when the account cannot be loaded. */
  loadAccount: () => Promise<Account>;
  /** Throws when the page cannot be loaded. */
  loadOrders: (before: string | null, limit?: number) => Promise<OrdersPage>;
  placeOrder: (order: OrderRequest) => Promise<OrderResult>;
  /** Throws when the reset failed; returns the fresh account. */
  reset: () => Promise<Account>;
};

function timeOrNull(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function decimalOrNull(value: unknown, scale: number): bigint | null {
  return typeof value === "string" ? parseDecimal(value, scale) : null;
}

function wholeOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export function parseOrder(value: unknown): Order | null {
  if (!isRecord(value)) return null;
  const { id, symbol, side, clientOrderId } = value;
  const quantity = wholeOrNull(value.quantity);
  const price = decimalOrNull(value.price, PRICE_SCALE);
  const total = decimalOrNull(value.total, CASH_SCALE);
  const createdAt = timeOrNull(value.createdAt);
  if (
    typeof id !== "string" ||
    typeof symbol !== "string" ||
    (side !== "buy" && side !== "sell") ||
    typeof clientOrderId !== "string" ||
    quantity === null ||
    price === null ||
    total === null ||
    createdAt === null
  ) {
    return null;
  }
  return { id, symbol, side, quantity, price, total, realizedPnl: decimalOrNull(value.realizedPnl, CASH_SCALE), clientOrderId, createdAt };
}

function parsePosition(value: unknown): Position | null {
  if (!isRecord(value)) return null;
  const quantity = wholeOrNull(value.quantity);
  const avgCost = decimalOrNull(value.avgCost, PRICE_SCALE);
  if (typeof value.symbol !== "string" || quantity === null || avgCost === null) return null;
  return {
    symbol: value.symbol,
    quantity,
    avgCost,
    listed: value.listed !== false,
    lastPrice: decimalOrNull(value.lastPrice, CASH_SCALE),
    lastPriceAt: timeOrNull(value.lastPriceAt),
  };
}

function parseActivity(value: unknown): SessionActivity | null {
  if (!isRecord(value)) return null;
  const boughtQuantity = wholeOrNull(value.boughtQuantity);
  const soldQuantity = wholeOrNull(value.soldQuantity);
  const boughtTotal = decimalOrNull(value.boughtTotal, CASH_SCALE);
  const soldTotal = decimalOrNull(value.soldTotal, CASH_SCALE);
  if (
    typeof value.symbol !== "string" ||
    typeof value.sessionId !== "string" ||
    boughtQuantity === null ||
    soldQuantity === null ||
    boughtTotal === null ||
    soldTotal === null
  ) {
    return null;
  }
  return { symbol: value.symbol, sessionId: value.sessionId, boughtQuantity, soldQuantity, boughtTotal, soldTotal };
}

function listOf<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) throw new Error("Malformed portfolio response");
  return value.map(parse).filter((item): item is T => item !== null);
}

/** The `GET /portfolio/account` body. A malformed body throws: cash is never guessed. */
export function parseAccount(body: unknown): Account {
  if (!isRecord(body)) throw new Error("Malformed account response");
  const cash = decimalOrNull(body.cash, CASH_SCALE);
  const startingCash = decimalOrNull(body.startingCash, CASH_SCALE);
  const realizedPnl = decimalOrNull(body.realizedPnl, CASH_SCALE);
  if (cash === null || startingCash === null || realizedPnl === null) throw new Error("Malformed account response");
  return {
    cash,
    startingCash,
    realizedPnl,
    positions: listOf(body.positions, parsePosition),
    sessionActivity: listOf(body.sessionActivity, parseActivity),
  };
}

export function parseOrdersPage(body: unknown): OrdersPage {
  if (!isRecord(body)) throw new Error("Malformed orders response");
  return { items: listOf(body.items, parseOrder), nextBefore: typeof body.nextBefore === "string" ? body.nextBefore : null };
}

async function errorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string") {
      return { code: typeof body.code === "string" ? body.code : "", message: body.error };
    }
  } catch {
    // Not JSON.
  }
  return { code: "", message: "The order was refused" };
}

const UNAVAILABLE = "Could not reach the trading service.";

/** The portfolio service's paper-trading endpoints, through the BFF (P3). */
export function createPortfolioApi(fetchImpl: ApiFetch = apiFetch): PortfolioApi {
  return {
    loadAccount: async () => {
      const response = await fetchImpl("/portfolio/account");
      if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
      return parseAccount(await response.json());
    },

    loadOrders: async (before, limit = 50) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before !== null) query.set("before", before);
      const response = await fetchImpl(`/portfolio/orders?${query.toString()}`);
      if (!response.ok) throw new Error(`Orders request failed: ${response.status}`);
      return parseOrdersPage(await response.json());
    },

    placeOrder: async (order) => {
      try {
        const response = await fetchImpl("/portfolio/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order),
        });
        if (response.status === 201 || response.status === 200) {
          const parsed = parseOrder(await response.json());
          return parsed
            ? { kind: "filled", order: parsed, replayed: response.status === 200 }
            : { kind: "failed", message: "Unexpected answer from the server." };
        }
        // 400, 404, 409 and 503 are answers about this order; anything else (502 from the BFF,
        // 500) may not have reached the service, so it is worth sending again.
        if ([400, 404, 409, 503].includes(response.status)) {
          return { kind: "refused", ...(await errorBody(response)) };
        }
        return { kind: "failed", message: UNAVAILABLE };
      } catch (error) {
        if (error instanceof LoggedOutError) return { kind: "loggedOut" };
        return { kind: "failed", message: UNAVAILABLE };
      }
    },

    // No body and no Content-Type: the BFF refuses a JSON content type with an empty body.
    reset: async () => {
      const response = await fetchImpl("/portfolio/account/reset", { method: "POST" });
      if (!response.ok) throw new Error(`Reset failed: ${response.status}`);
      return parseAccount(await response.json());
    },
  };
}
