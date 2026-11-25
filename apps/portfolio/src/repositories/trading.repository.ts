import type { Pool, PoolClient } from "pg";
import { CASH_SCALE, formatDecimal, parseDecimal, PRICE_SCALE } from "../models/money.js";
import type { Fill, Holding, Side } from "../models/trading.js";
import { withTransaction } from "./transaction.js";

export type OrderRow = {
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
  createdAt: Date;
};

export type PositionRow = Holding & { symbol: string };

/** What the user traded in one symbol during its current session (for day P&L). */
export type SessionActivityRow = {
  symbol: string;
  sessionId: string;
  boughtQuantity: number;
  soldQuantity: number;
  /** Cents. */
  boughtTotal: bigint;
  /** Cents. */
  soldTotal: bigint;
};

/** One symbol's current session: from when, and its id. */
export type SessionWindow = { symbol: string; start: Date; sessionId: string };

export type AccountSnapshot = {
  /** Cents. */
  cash: bigint;
  /** Cents, summed over every sell. */
  realizedPnl: bigint;
  createdAt: Date;
  positions: PositionRow[];
  /** The latest fill price (scale 4) per held symbol: a price for a position Redis cannot give. */
  lastFills: Map<string, { price: bigint; at: Date }>;
  activity: SessionActivityRow[];
};

// NUMERIC is selected as text and parsed into bigint; `pg` never turns it into a float.
const ORDER_COLUMNS = `id::text AS id, symbol, side, quantity, price::text AS price, total::text AS total,
  realized_pnl::text AS realized_pnl, client_order_id::text AS client_order_id, created_at`;

function field(row: unknown, name: string): unknown {
  return typeof row === "object" && row !== null ? Reflect.get(row, name) : undefined;
}

function decimalField(row: unknown, name: string, scale: number): bigint | null {
  const value = field(row, name);
  return typeof value === "string" ? parseDecimal(value, scale) : null;
}

function integerField(row: unknown, name: string): number | null {
  const value = field(row, name);
  // int4 comes as a number; a bigint (sum, count) as a string.
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toOrder(row: unknown): OrderRow | null {
  const id = field(row, "id");
  const symbol = field(row, "symbol");
  const side = field(row, "side");
  const quantity = integerField(row, "quantity");
  const price = decimalField(row, "price", PRICE_SCALE);
  const total = decimalField(row, "total", CASH_SCALE);
  const realizedPnl = decimalField(row, "realized_pnl", CASH_SCALE);
  const clientOrderId = field(row, "client_order_id");
  const createdAt = field(row, "created_at");
  if (
    typeof id !== "string" ||
    typeof symbol !== "string" ||
    (side !== "buy" && side !== "sell") ||
    quantity === null ||
    price === null ||
    total === null ||
    typeof clientOrderId !== "string" ||
    !(createdAt instanceof Date)
  ) {
    return null;
  }
  return { id, symbol, side, quantity, price, total, realizedPnl, clientOrderId, createdAt };
}

function toPosition(row: unknown): PositionRow | null {
  const symbol = field(row, "symbol");
  const quantity = integerField(row, "quantity");
  const avgCost = decimalField(row, "avg_cost", PRICE_SCALE);
  if (typeof symbol !== "string" || quantity === null || avgCost === null) return null;
  return { symbol, quantity, avgCost };
}

function toActivity(row: unknown): SessionActivityRow | null {
  const symbol = field(row, "symbol");
  const sessionId = field(row, "session_id");
  const boughtQuantity = integerField(row, "bought_quantity");
  const soldQuantity = integerField(row, "sold_quantity");
  const boughtTotal = decimalField(row, "bought_total", CASH_SCALE);
  const soldTotal = decimalField(row, "sold_total", CASH_SCALE);
  if (
    typeof symbol !== "string" ||
    typeof sessionId !== "string" ||
    boughtQuantity === null ||
    soldQuantity === null ||
    boughtTotal === null ||
    soldTotal === null
  ) {
    return null;
  }
  return { symbol, sessionId, boughtQuantity, soldQuantity, boughtTotal, soldTotal };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

function cashOf(rows: readonly unknown[]): bigint {
  const cash = decimalField(rows[0], "cash", CASH_SCALE);
  if (cash === null) throw new Error("The account row has no readable cash");
  return cash;
}

/** Inserts the account with the starting cash unless it exists. Two first visits at once make one row. */
async function ensureAccount(client: Pool | PoolClient, userId: string, startingCash: bigint): Promise<void> {
  await client.query(
    "INSERT INTO accounts (user_id, cash) VALUES ($1, $2::numeric) ON CONFLICT (user_id) DO NOTHING",
    [userId, formatDecimal(startingCash, CASH_SCALE)],
  );
}

/**
 * One order's view of a locked account. Exists only inside {@link TradingRepository.withAccount},
 * so every read and write here happens while the account row is locked.
 */
export class LockedAccount {
  constructor(
    private readonly client: PoolClient,
    private readonly userId: string,
    /** Cents, as locked. */
    readonly cash: bigint,
  ) {}

  async findOrder(clientOrderId: string): Promise<OrderRow | null> {
    const result = await this.client.query(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 AND client_order_id = $2`,
      [this.userId, clientOrderId],
    );
    return toOrder(result.rows[0]);
  }

  async holding(symbol: string): Promise<Holding | null> {
    const result = await this.client.query(
      "SELECT symbol, quantity, avg_cost::text AS avg_cost FROM positions WHERE user_id = $1 AND symbol = $2",
      [this.userId, symbol],
    );
    return toPosition(result.rows[0]);
  }

  /** Deletes the positions and orders and sets the cash to `startingCash` (Settings → Reset). */
  async clear(startingCash: bigint): Promise<void> {
    await this.client.query("DELETE FROM positions WHERE user_id = $1", [this.userId]);
    await this.client.query("DELETE FROM orders WHERE user_id = $1", [this.userId]);
    await this.client.query("UPDATE accounts SET cash = $2::numeric WHERE user_id = $1", [
      this.userId,
      formatDecimal(startingCash, CASH_SCALE),
    ]);
  }

  /** Writes a fill: the cash, the position (deleted at zero) and the order row. */
  async record(order: { symbol: string; side: Side; quantity: number; clientOrderId: string }, fill: Fill): Promise<OrderRow> {
    await this.client.query("UPDATE accounts SET cash = $2::numeric WHERE user_id = $1", [
      this.userId,
      formatDecimal(fill.cashAfter, CASH_SCALE),
    ]);
    if (fill.holdingAfter) {
      await this.client.query(
        `INSERT INTO positions (user_id, symbol, quantity, avg_cost) VALUES ($1, $2, $3, $4::numeric)
         ON CONFLICT (user_id, symbol) DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost`,
        [this.userId, order.symbol, fill.holdingAfter.quantity, formatDecimal(fill.holdingAfter.avgCost, PRICE_SCALE)],
      );
    } else {
      await this.client.query("DELETE FROM positions WHERE user_id = $1 AND symbol = $2", [this.userId, order.symbol]);
    }
    const inserted = await this.client.query(
      `INSERT INTO orders (user_id, symbol, side, quantity, price, total, realized_pnl, client_order_id)
       VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8)
       RETURNING ${ORDER_COLUMNS}`,
      [
        this.userId,
        order.symbol,
        order.side,
        order.quantity,
        formatDecimal(fill.price, PRICE_SCALE),
        formatDecimal(fill.total, CASH_SCALE),
        fill.realizedPnl === null ? null : formatDecimal(fill.realizedPnl, CASH_SCALE),
        order.clientOrderId,
      ],
    );
    const row = toOrder(inserted.rows[0]);
    if (!row) throw new Error("INSERT … RETURNING gave no order row");
    return row;
  }
}

/**
 * P3's tables: `accounts`, `positions`, `orders`. Every query filters on `user_id`. Writes go
 * through {@link withAccount}, which locks the account row (`SELECT … FOR UPDATE`): two orders
 * from two tabs run one after the other, and the second sees the cash the first left.
 */
export class TradingRepository {
  constructor(
    private readonly db: Pool,
    /** Cents: what a new or reset account holds. */
    readonly startingCashCents: bigint,
  ) {}

  /** Runs `work` in one transaction with the user's account created if needed and locked. */
  async withAccount<T>(userId: string, work: (account: LockedAccount) => Promise<T>): Promise<T> {
    return withTransaction(this.db, async (client) => {
      await ensureAccount(client, userId, this.startingCashCents);
      const locked = await client.query("SELECT cash::text AS cash FROM accounts WHERE user_id = $1 FOR UPDATE", [userId]);
      return work(new LockedAccount(client, userId, cashOf(locked.rows)));
    });
  }

  /**
   * Cash, positions and this session's trades as of one moment: the reads share a REPEATABLE
   * READ snapshot, so an order committing in between cannot show its cash without its position.
   */
  async snapshot(userId: string, sessions: readonly SessionWindow[]): Promise<AccountSnapshot> {
    await ensureAccount(this.db, userId, this.startingCashCents);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const account = await client.query(
        "SELECT cash::text AS cash, created_at FROM accounts WHERE user_id = $1",
        [userId],
      );
      const createdAt = field(account.rows[0], "created_at");
      const positions = await client.query(
        "SELECT symbol, quantity, avg_cost::text AS avg_cost FROM positions WHERE user_id = $1 ORDER BY symbol",
        [userId],
      );
      const realized = await client.query(
        "SELECT COALESCE(sum(realized_pnl), 0)::text AS realized_pnl FROM orders WHERE user_id = $1",
        [userId],
      );
      const lastFills = await client.query(
        `SELECT DISTINCT ON (o.symbol) o.symbol, o.price::text AS price, o.created_at
           FROM orders o JOIN positions p ON p.user_id = o.user_id AND p.symbol = o.symbol
          WHERE o.user_id = $1
          ORDER BY o.symbol, o.created_at DESC, o.id DESC`,
        [userId],
      );
      const activity = await client.query(
        `SELECT o.symbol, s.session_id,
                COALESCE(sum(o.quantity) FILTER (WHERE o.side = 'buy'), 0) AS bought_quantity,
                COALESCE(sum(o.quantity) FILTER (WHERE o.side = 'sell'), 0) AS sold_quantity,
                COALESCE(sum(o.total) FILTER (WHERE o.side = 'buy'), 0)::text AS bought_total,
                COALESCE(sum(o.total) FILTER (WHERE o.side = 'sell'), 0)::text AS sold_total
           FROM orders o
           JOIN unnest($2::text[], $3::timestamptz[], $4::text[]) AS s(symbol, start, session_id)
             ON o.symbol = s.symbol AND o.created_at >= s.start
          WHERE o.user_id = $1
          GROUP BY o.symbol, s.session_id
          ORDER BY o.symbol`,
        [userId, sessions.map((s) => s.symbol), sessions.map((s) => s.start), sessions.map((s) => s.sessionId)],
      );
      await client.query("COMMIT");
      if (!(createdAt instanceof Date)) throw new Error("The account row has no created_at");
      const fills = new Map<string, { price: bigint; at: Date }>();
      for (const row of lastFills.rows) {
        const symbol = field(row, "symbol");
        const price = decimalField(row, "price", PRICE_SCALE);
        const at = field(row, "created_at");
        if (typeof symbol === "string" && price !== null && at instanceof Date) fills.set(symbol, { price, at });
      }
      return {
        cash: cashOf(account.rows),
        realizedPnl: decimalField(realized.rows[0], "realized_pnl", CASH_SCALE) ?? 0n,
        createdAt,
        positions: positions.rows.map(toPosition).filter(present),
        lastFills: fills,
        activity: activity.rows.map(toActivity).filter(present),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Newest first. `before`: the id of the last order of the previous page. */
  async listOrders(userId: string, limit: number, before: string | null): Promise<OrderRow[]> {
    const result =
      before === null
        ? await this.db.query(
            `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
            [userId, limit],
          )
        : await this.db.query(
            // An unknown `before` (or another user's) matches no row, so the page is empty.
            `SELECT ${ORDER_COLUMNS} FROM orders
              WHERE user_id = $1
                AND (created_at, id) < (SELECT created_at, id FROM orders WHERE user_id = $1 AND id = $3)
              ORDER BY created_at DESC, id DESC
              LIMIT $2`,
            [userId, limit, before],
          );
    return result.rows.map(toOrder).filter(present);
  }

  /** Starts over: no positions, no orders, the starting cash. Locked like an order. */
  async reset(userId: string): Promise<void> {
    await this.withAccount(userId, (account) => account.clear(this.startingCashCents));
  }

  /** Every row of the user in the three tables. Used by K6 when the account is deleted. */
  async deleteUser(client: PoolClient, userId: string): Promise<number> {
    const orders = await client.query("DELETE FROM orders WHERE user_id = $1", [userId]);
    const positions = await client.query("DELETE FROM positions WHERE user_id = $1", [userId]);
    const accounts = await client.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
    return (orders.rowCount ?? 0) + (positions.rowCount ?? 0) + (accounts.rowCount ?? 0);
  }
}
