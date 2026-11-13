# 06 · Personal features

Per-user features. Confirmed decisions: data is stored **server-side from the start**, and everything is behind login. All three therefore need A2 and A3 first.

## Shared groundwork: the portfolio service

*(Decided (Q4): one new service.)*

Build this once, with P1.

1. New app `apps/portfolio` on port 3006, following the structure of `apps/user`: config, routes, services, repositories, `prepareSchema` at startup, health routes.
2. Uses `packages/db` (Postgres), `packages/redis` (to read `price:latest:<symbol>`), and the shared guard from A2.
3. Every route takes the user id from `request.authUserId`. No route accepts a user id in the path or body, which removes the ownership bug class from A1 by construction.
4. Every table has `user_id UUID NOT NULL` and every query filters on it.
5. Add the service to `scripts/dev.sh`, `.env.local.example`, and the frontend dev proxy (`/portfolio` → 3006).

Shared concerns:

- **No cross-service foreign key.** `users` belongs to the user service. Deleting a user leaves rows here until a cleanup path exists (see A4).
- **Schema changes.** The project creates tables with `CREATE TABLE IF NOT EXISTS` at startup, which cannot alter an existing table safely. Money tables need real, ordered migrations; introduce a minimal migration runner before P3.
- **Symbol validation.** Reject symbols that are not in M1's registry.

---

## P1 · Watchlist — score 67

**Problem.** Every user sees the same list in the same order, with no way to mark the symbols they care about.

**Plan.**

1. Table `watchlist_items (user_id, symbol, position, created_at)`, primary key `(user_id, symbol)`.
2. API: `GET /portfolio/watchlist`; `PUT /portfolio/watchlist/:symbol` (idempotent add); `DELETE /portfolio/watchlist/:symbol` (idempotent remove); `PUT /portfolio/watchlist/order` with the full ordered list.
3. UI: a star on each card, table row and the detail dialog. A "Watchlist" filter pill. Starred symbols sort first under the default sort.
4. Optimistic update: toggle the star immediately, roll back and show a message if the request fails.
5. Empty state for the Watchlist filter: "Star a symbol to add it here".
6. Cap the list (for example 100 symbols) and return `409` beyond it.

**Edge cases.**

- Fast double-click on a star: add then remove race. `PUT` and `DELETE` are idempotent, so apply them in order per symbol by queuing or cancelling the earlier request.
- Two tabs or devices: the second is stale until it refetches. Refetch on window focus.
- A watched symbol is later removed from the registry: keep the row, hide it from the grid, show it greyed in a manage view so the user can remove it.
- Reordering from two devices at once: last write wins; the client sends the full order, so the result is always a consistent list.
- Reorder payload containing unknown or duplicate symbols: reject with `400`.
- The server is unreachable: stars are read-only and say so, rather than silently dropping changes.

**Future issues.**

- Multiple named lists are the obvious next request. Adding a `list_id` column later means a migration and API change; if that is likely, start with a `watchlists` table and a single default list per user.
- With the stream limited to subscribed symbols, the watchlist could drive the subscription and reduce traffic.

**Done when.** A star set on one device appears on another after a refresh, and survives logout and login.

---

## P2 · Price alerts — score 59

**Problem.** A user has to watch the screen to notice a price level.

**Plan.** *(Decided (Q7): evaluation in the browser for v1.)*

1. Table `price_alerts (id, user_id, symbol, direction 'above'|'below', threshold NUMERIC, created_at, triggered_at NULL, triggered_price NULL)`.
2. API: list, create, delete, and `POST /portfolio/alerts/:id/trigger`, which sets `triggered_at` only if it is still null and reports whether this call was the one that set it.
3. Client: an alerts context loads active alerts and checks each incoming quote for its symbol. On a hit it calls the trigger endpoint and shows the notification only if the server confirms it was first.
4. Notification: an in-app toast and a bell with a list of recent triggers. Optionally the browser Notification API, with permission requested only when the user enables it in the alert form.
5. Create form in the detail dialog: direction, price (prefilled with the current price), validation that the threshold is positive.
6. Alerts are one-shot. A triggered alert moves to history and can be re-armed.
7. Cap active alerts per user (for example 50).

**Edge cases.**

- **Alerts do not fire when no tab is open.** This is the main limitation of browser evaluation and must be stated in the UI ("Alerts are checked while Streamtick is open").
- The price is already past the threshold at creation: warn and ask the user to confirm, otherwise the alert fires instantly.
- A price can jump past a threshold between two ticks. Use `>=` and `<=` comparisons on the latest price, not equality, and not "crossed since last tick".
- Two tabs or devices both see the crossing: the conditional update in step 2 ensures exactly one notification per alert.
- After a reconnect, compare against the first new price so a crossing during the gap is still caught, late.
- The snapshot event on connect (B2) should count for alert evaluation even though it is not a trade.
- Browser notification permission denied: fall back to the toast without asking again.
- Background tabs are throttled but still receive stream data; toasts shown while hidden should remain until the user returns.
- Floating-point thresholds: store `NUMERIC`, compare in cents.
- Deleting an alert in one tab while another is about to trigger it: the trigger call returns `404`; ignore it silently.

**Future issues.**

- Server-side evaluation is the real fix: a worker reads the `price:updates` Redis stream, keeps active alerts indexed by symbol in memory, and pushes an `alert` event to the user's stream. It needs S2's shared reader and a per-user event channel. Design the table so this worker can take over without a migration (it can).
- Delivery when the user is offline needs email or push, which are third-party integrations.
- More alert types follow naturally: percent change, day high/low break, volume spike.
- On a real feed, a bad tick can trigger alerts wrongly; real systems filter outliers before evaluating.

**Done when.** An alert set just above the current price fires once, in exactly one of two open tabs, and appears as triggered after a reload.

---

## P3 · Paper trading — score 64

**Problem.** The project is called stock-trading and nothing can be traded. A virtual portfolio is the most convincing demo feature and the hardest item here.

**Plan.** *(Decided (Q8): $100,000 starting cash, market orders, whole shares, long only, no fees. Needs a migration runner; better after M2.)*

1. Tables:
   - `accounts (user_id PK, cash NUMERIC(18,2), created_at)`
   - `positions (user_id, symbol, quantity INTEGER, avg_cost NUMERIC(18,4), PRIMARY KEY (user_id, symbol))`
   - `orders (id UUID PK, user_id, symbol, side, quantity, price NUMERIC(18,4), total NUMERIC(18,2), client_order_id UUID, created_at, UNIQUE (user_id, client_order_id))`
2. `POST /portfolio/orders` with `{ symbol, side, quantity, clientOrderId }`. The **server** reads the price from Redis (`price:latest:<symbol>`); the client never supplies it.
3. One database transaction per order: lock the account row (`SELECT … FOR UPDATE`), validate, update cash, upsert the position, insert the order. Either all of it commits or none.
4. Validation: buy requires `cash >= quantity × price`; sell requires `position.quantity >= quantity`; quantity is a positive integer with an upper bound.
5. Idempotency: the client generates `clientOrderId` once per submission. A retry with the same id returns the original order instead of executing again.
6. Reject the order if the price in Redis is older than a few seconds ("market data unavailable").
7. Read endpoints: `GET /portfolio/account` (cash, positions with average cost), `GET /portfolio/orders` (paginated history). The client computes market value and unrealised P&L from live prices.
8. Create the account lazily on first access, using `INSERT … ON CONFLICT DO NOTHING`.
9. UI: `/portfolio` page with a summary (cash, market value, total and day P&L), a positions table and order history. A trade ticket in the detail dialog: side, quantity, estimated cost, confirm step, result showing the actual fill price.
10. "Reset portfolio" in Settings, with confirmation.

**Edge cases.**

- **Never use floating point for money.** Prices are `DOUBLE PRECISION` in `stock_ticks` and JavaScript numbers in Redis. Convert to integer cents (or a decimal type) at the boundary of the portfolio service and do all arithmetic there. The `pg` driver returns `NUMERIC` as strings; parse deliberately.
- The fill price differs from the price shown when the user clicked, because the market moved. Show the actual fill and label the ticket's figure as an estimate.
- Double-click or network retry on Buy: handled by `clientOrderId`.
- Two orders from two tabs at once: the row lock serialises them; the second sees the updated cash.
- Selling the entire position: delete the row or keep it at zero quantity, and never divide by zero quantity when showing average cost.
- Average cost changes on buys only: `(old_qty × old_avg + qty × price) / new_qty`. Sells leave it unchanged and realise P&L of `(price − avg_cost) × qty`. Store realised P&L on the order row.
- First access from two tabs simultaneously: step 8 prevents duplicate accounts.
- Quantity sent as a string, a fraction, zero, negative or enormous: strict schema validation.
- A held symbol leaves the registry: the position can no longer be priced or sold. Show it as "untradeable" with its last known price.
- Token expires in the middle of a submission: the API client retries after refresh, and the same `clientOrderId` makes that safe.
- Redis down: orders are rejected; reads of cash and positions still work.
- Rounding: round `total` to cents once, on the server, and store it; never recompute it from quantity × price later.

**Future issues.**

- **Market hours.** With a real feed, orders outside the session must be rejected or queued. The `MarketCalendar` from M2 is the hook.
- **Order types.** Limit and stop orders need a matching worker that watches the price stream, plus order states (open, filled, cancelled, expired). That is a significant second phase.
- **Corporate actions.** A split on a real feed halves the price; without adjusting positions, every holder appears to lose half their value.
- **Portfolio value over time.** An equity curve needs periodic snapshots of each account's value; no such job exists.
- **Short selling, fractional shares, fees.** Each changes the validation and the data types (quantity would stop being an integer).
- **Data licensing.** Real-time prices used for simulated trading may need a specific licence.
- **Account deletion.** Orders are a ledger; decide whether deleting a user removes or anonymises them.
- **Fairness.** The simulated price moves ±0.5% every second; a script could exploit it. Irrelevant for a demo, relevant if a leaderboard is ever added.

**Done when.** A user can buy and sell at the live price, cash plus position cost always reconciles with the order history, a repeated request does not execute twice, and two simultaneous orders cannot overspend the account.
