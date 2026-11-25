import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Link } from "react-router";
import { buttonClass, focusRing, panelClass } from "../components/pageStyles";
import { formatMoney, formatPercentOf, formatPrice4, formatSignedMoney } from "../portfolio/money";
import type { Order } from "../portfolio/portfolioApi";
import { usePortfolio } from "../portfolio/PortfolioProvider";
import { valuePortfolio } from "../portfolio/valuation";
import type { PositionValue } from "../portfolio/valuation";
import { useStreamData } from "../stream/StreamProvider";
import { NO_VALUE } from "../utils/format";

const linkClass = `rounded-sm text-brand underline underline-offset-2 ${focusRing}`;
const th = "px-3 py-2 text-left text-[12px] font-medium text-secondary uppercase";
const thNum = `${th} text-right`;
const td = "px-3 py-2";
const tdNum = `${td} text-right font-mono`;

function tone(value: bigint | null): string {
  if (value === null || value === 0n) return "";
  return value > 0n ? "text-positive" : "text-negative";
}

function signed(value: bigint | null): string {
  return value === null ? NO_VALUE : formatSignedMoney(value);
}

function quoteLink(symbol: string): string {
  return `/?symbol=${encodeURIComponent(symbol)}`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function Tile(props: { label: string; value: string; detail?: string; valueTone?: string }): JSX.Element {
  return (
    <div className="rounded-md border border-subtle bg-surface p-3">
      <dt className="text-[12px] text-secondary uppercase">{props.label}</dt>
      <dd className={`font-mono text-[17px] font-semibold wrap-anywhere ${props.valueTone ?? ""}`}>{props.value}</dd>
      {props.detail !== undefined && <dd className={`font-mono text-[13px] ${props.valueTone ?? "text-secondary"}`}>{props.detail}</dd>}
    </div>
  );
}

function PositionRow({ value }: { value: PositionValue }): JSX.Element {
  const { position } = value;
  return (
    <tr className="border-t border-subtle">
      <th scope="row" className={`${td} text-left font-normal`}>
        {position.listed ? (
          <Link to={quoteLink(position.symbol)} className={`font-mono font-semibold ${linkClass} no-underline`}>
            {position.symbol}
          </Link>
        ) : (
          <span className="font-mono font-semibold text-secondary">{position.symbol}</span>
        )}
        {!position.listed && <span className="block text-[12px] text-warning">Untradeable: no longer listed</span>}
      </th>
      <td className={tdNum}>{position.quantity.toLocaleString("en-US")}</td>
      <td className={`${tdNum} hidden md:table-cell`}>{formatPrice4(position.avgCost)}</td>
      <td className={`${tdNum} hidden sm:table-cell`}>
        {value.price === null ? NO_VALUE : formatMoney(value.price)}
        {value.price !== null && !value.live && <span className="block text-[12px] text-secondary">last known</span>}
      </td>
      <td className={tdNum}>{value.marketValue === null ? NO_VALUE : formatMoney(value.marketValue)}</td>
      <td className={`${tdNum} ${tone(value.unrealizedPnl)}`}>
        {signed(value.unrealizedPnl)}
        {value.unrealizedPnl !== null && (
          <span className="block text-[12px]">{formatPercentOf(value.unrealizedPnl, value.costBasis) ?? ""}</span>
        )}
      </td>
      <td className={`${tdNum} hidden md:table-cell ${tone(value.dayPnl)}`}>{signed(value.dayPnl)}</td>
    </tr>
  );
}

function OrderRow({ order }: { order: Order }): JSX.Element {
  return (
    <tr className="border-t border-subtle">
      <td className={`${td} text-[13px] text-secondary`}>
        <time dateTime={new Date(order.createdAt).toISOString()}>{dateTime.format(order.createdAt)}</time>
      </td>
      <td className={td}>
        <span className={order.side === "buy" ? "text-positive" : "text-negative"}>{order.side === "buy" ? "Buy" : "Sell"}</span>{" "}
        <span className="font-mono font-semibold">{order.symbol}</span>
      </td>
      <td className={tdNum}>{order.quantity.toLocaleString("en-US")}</td>
      <td className={`${tdNum} hidden sm:table-cell`}>{formatPrice4(order.price)}</td>
      <td className={tdNum}>{formatMoney(order.total)}</td>
      <td className={`${tdNum} hidden md:table-cell ${tone(order.realizedPnl)}`}>{order.realizedPnl === null ? "" : signed(order.realizedPnl)}</td>
    </tr>
  );
}

/** The order history, newest first, a page at a time. Reloads from the top after every fill or reset. */
function OrderHistory(): JSX.Element {
  const { api, revision } = usePortfolio();
  const [orders, setOrders] = useState<Order[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "more">("loading");
  const latest = useRef(0);

  const load = useCallback(
    (before: string | null) => {
      const request = ++latest.current;
      setState(before === null ? "loading" : "more");
      api.loadOrders(before).then(
        (page) => {
          if (request !== latest.current) return;
          setOrders((current) => (before === null ? page.items : [...current, ...page.items]));
          setNext(page.nextBefore);
          setState("ready");
        },
        () => {
          if (request === latest.current) setState("error");
        },
      );
    },
    [api],
  );

  useEffect(() => {
    load(null);
  }, [load, revision]);

  return (
    <section aria-labelledby="portfolio-orders" className="grid gap-2">
      <h2 id="portfolio-orders" className="text-[15px] font-semibold">
        Order history
      </h2>
      {state === "loading" && orders.length === 0 && <p className={panelClass}>Loading your orders…</p>}
      {state !== "loading" && orders.length === 0 && state !== "error" && <p className={panelClass}>No orders yet.</p>}
      {orders.length > 0 && (
        <div className="overflow-hidden rounded-[10px] border border-default bg-surface">
          <table className="w-full text-[14px]">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Time
                </th>
                <th scope="col" className={th}>
                  Order
                </th>
                <th scope="col" className={thNum}>
                  Shares
                </th>
                <th scope="col" className={`${thNum} hidden sm:table-cell`}>
                  Price
                </th>
                <th scope="col" className={thNum}>
                  Total
                </th>
                <th scope="col" className={`${thNum} hidden md:table-cell`}>
                  Realised P&amp;L
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state === "error" && (
        <p role="alert" className="text-[13px] text-negative">
          Could not load the order history.{" "}
          <button type="button" onClick={() => load(orders.length === 0 ? null : next)} className={`${buttonClass} h-7 px-2.5 text-[13px]`}>
            Retry
          </button>
        </p>
      )}
      {next !== null && state !== "error" && (
        <button type="button" onClick={() => load(next)} disabled={state === "more"} className={`${buttonClass} justify-self-start`}>
          {state === "more" ? "Loading…" : "Load older orders"}
        </button>
      )}
    </section>
  );
}

/**
 * `/portfolio` (P3 step 9): the paper-trading account at live prices. The server keeps cash,
 * quantities, average cost and the ledger; this page adds market value and P&L from the stream.
 * Orders are placed from the quote dialog.
 */
export function PortfolioPage(): JSX.Element {
  const { account, status, loadFailed, reload } = usePortfolio();
  const { stocks } = useStreamData();

  if (account === null) {
    return (
      <div className="grid max-w-[960px] gap-4">
        <h1 className="text-[20px] font-semibold">Portfolio</h1>
        {status === "error" ? (
          <div role="alert" className={panelClass}>
            <p className="mb-2.5">Your portfolio cannot be loaded right now.</p>
            <button type="button" onClick={reload} className={buttonClass}>
              Retry
            </button>
          </div>
        ) : (
          <p className={panelClass}>Loading your portfolio…</p>
        )}
      </div>
    );
  }

  const quotes = new Map(stocks.map((s) => [s.symbol, s]));
  const value = valuePortfolio(account, quotes);

  return (
    <div className="grid max-w-[960px] gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] font-semibold">Portfolio</h1>
        <p className="text-secondary">
          Paper trading with {formatMoney(account.startingCash)} of play money: market orders, whole shares, no fees. To
          trade, open a quote on the{" "}
          <Link to="/" className={linkClass}>
            Quotes
          </Link>{" "}
          page.
        </p>
      </header>

      {loadFailed && (
        <p role="status" className="text-[13px] text-warning">
          The latest account could not be loaded; this is what was known before.{" "}
          <button type="button" onClick={reload} className={`${buttonClass} h-7 px-2.5 text-[13px]`}>
            Retry
          </button>
        </p>
      )}

      <dl aria-label="Summary" className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label="Total value" value={formatMoney(value.totalValue)} />
        <Tile label="Cash" value={formatMoney(value.cash)} />
        <Tile label="Market value" value={formatMoney(value.marketValue)} />
        <Tile
          label="Total P&L"
          value={formatSignedMoney(value.totalPnl)}
          detail={formatPercentOf(value.totalPnl, account.startingCash) ?? ""}
          valueTone={tone(value.totalPnl)}
        />
        <Tile label="Day P&L" value={signed(value.dayPnl)} valueTone={tone(value.dayPnl)} />
      </dl>
      {value.incomplete && (
        <p className="text-[13px] text-warning">Some positions have no price yet, so the totals leave them out.</p>
      )}

      <section aria-labelledby="portfolio-positions" className="grid gap-2">
        <h2 id="portfolio-positions" className="text-[15px] font-semibold">
          Positions
        </h2>
        {value.positions.length === 0 ? (
          <p className={panelClass}>
            No positions. Open a quote and use <span className="text-primary">Buy</span> in its Trade section.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-default bg-surface">
            <table className="w-full text-[14px]">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Symbol
                  </th>
                  <th scope="col" className={thNum}>
                    Shares
                  </th>
                  <th scope="col" className={`${thNum} hidden md:table-cell`}>
                    Avg cost
                  </th>
                  <th scope="col" className={`${thNum} hidden sm:table-cell`}>
                    Price
                  </th>
                  <th scope="col" className={thNum}>
                    Value
                  </th>
                  <th scope="col" className={thNum}>
                    P&amp;L
                  </th>
                  <th scope="col" className={`${thNum} hidden md:table-cell`}>
                    Day P&amp;L
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.positions.map((p) => (
                  <PositionRow key={p.position.symbol} value={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-secondary">
          Realised P&amp;L from sales: <span className={`font-mono ${tone(account.realizedPnl)}`}>{signed(account.realizedPnl)}</span>.
          Day P&amp;L measures shares held since before today from the previous close, and shares bought today from their
          fill price.
        </p>
      </section>

      <OrderHistory />
    </div>
  );
}
