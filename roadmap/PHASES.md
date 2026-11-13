# Phases

The roadmap cut into pieces that each fit one working session. `README.md` gives the reasons for the order; this file is the tracker. To run a phase, start a fresh chat and say: **Read roadmap/PROMPT.md and follow it.**

## Status

Statuses: `todo`, `in progress`, `done`. The next phase is the first row that is not `done`. Each phase is done on its own feature branch and ends with a pull request into `master`; a phase only counts as `done` for the next session once that pull request is merged.

| Phase | Items | Plan file | Needs | Status |
|---|---|---|---|---|
| 01 | B1, B2, B3, S3 step 1 | 01-bug-fixes.md, 07-streaming.md | — | done |
| 02 | U1 | 02-ui-foundation.md | 01 | todo |
| 03 | U5, U4 | 02-ui-foundation.md | 02 | todo |
| 04 | U2, U3 | 02-ui-foundation.md | 03 | todo |
| 05 | M1 | 03-market-data.md | 03 | todo |
| 06 | M2, M5 | 03-market-data.md | 05 | todo |
| 07 | M3, M6 | 03-market-data.md | 05 | todo |
| 08 | M4 | 03-market-data.md | 07 | todo |
| 09 | A1 | 04-auth.md | — | todo |
| 10 | A2, A3 | 04-auth.md | 03, 09 | todo |
| 11 | A4 | 04-auth.md | 10 | todo |
| 12 | D1, D2, D3 | 05-dashboard.md | 04, 06 | todo |
| 13 | D4, D5 | 05-dashboard.md | 11, 12 | todo |
| 14 | Portfolio service, P1 | 06-personal.md | 05, 10 | todo |
| 15 | P2 | 06-personal.md | 14 | todo |
| 16 | Migration runner, P3 | 06-personal.md | 06, 14 | todo |
| 17 | S1, S2 | 07-streaming.md | 10 | todo |
| 18 | S3 steps 2–6, M4 step 3 | 07-streaming.md, 03-market-data.md | 08 | todo |

## Phase briefs

Each brief adds only what the plan files do not say: scope limits, decisions to ask the owner about, and things earlier phases left behind. The plan files remain the source of truth for steps, edge cases and "Done when".

### 02 · Tailwind migration (U1)
- U1 only, finished completely; the plan forbids starting U2 on a half-converted codebase.
- One commit per component, in the order the plan lists.
- `DetailPanel` gained more inline styles in phase 01 (sparkline section, error state, stale note); convert those too.
- Check the Tailwind 4 theming docs before writing the theme directive.

### 03 · Routing and states (U5, U4)
- U5 first, then U4.
- **Ask the owner:** the router library is not chosen (README Q6). Propose one with a one-line reason and wait.
- `App.tsx` passes a stable `onOpen` so `memo(PriceCard)` skips cards whose stock did not change. Keep that when the stream moves into a context: one symbol's tick must not re-render every card.
- `App.tsx` closes the dialog when its symbol leaves the list. U5 puts the symbol in the URL and wants a "symbol not found" state; replace the old behaviour with the plan's.
- `DetailPanel` shows a temporary "values may be out of date" line when the stream is not live. U4's shared stale treatment replaces it.
- No new pages beyond the shell, the quotes route and a 404 page.

### 04 · Responsive and accessible (U2, U3)
- U2 first, then U3.
- Already done in phase 01: dialog width `min(420px, calc(100vw - 32px))` (U2 turns it into a full-screen sheet on narrow screens) and `aria-label="Close"` on the dialog close button (U3 step 7).
- Neither item can be verified by the type-checker. Check 360px, 768px and 1440px, and tab through the whole dashboard.

### 05 · Symbol registry (M1)
- The symbol list is in three places; after this phase it is in one.
- Phase 03 removed the dead sector pills; this phase brings back real ones.
- A symbol with no ticks returns `null` prices and renders "—", not `$0.00`.

### 06 · Session stats and movers (M2, M5)
- M2 first; M5 is small and depends on it.
- **Ask the owner:** the plan offers two fixes for out-of-order delivery (key Kafka by symbol alone, or keep the key and ignore older ticks). Put both to the owner with a recommendation before coding; the first changes the idempotency contract.
- The atomic update (Lua or `WATCH`) must keep two phase 01 behaviours: the idempotency marker is written with a 24-hour expiry inside the same atomic step, and sparkline members stay `<timestamp>:<price>`.
- Phase 01 added `changeValue` (tick-to-tick) to `StreamQuote`. `DetailPanel` derives "Previous tick" from it and labels tiles "since start". After M2 these become real session values and labels (B3 step 6).
- **Known defect, raise it when changing `StreamQuote`:** the consumer builds the stream payload from the latest-price record, so every feed row has `quantity: 0` and a buy/sell side guessed from the price change. The real size and side are on the `PriceEvent`. Ask the owner whether to fix it here; D2 (phase 12) displays quantity and needs it.

### 07 · History and export (M3, M6)
- M3 first, then M6.
- Postgres access goes into the SSE service (plan step 1), not a new service.
- Auth does not exist yet, so the CSV download can be a plain link for now; phase 10 changes it to a blob fetch.

### 08 · Candle chart (M4)
- Steps 1, 2, 4, 5 and 6. Step 3 (continuous aggregates) is in phase 18.
- Hand-written SVG (README Q5); no charting library.
- Check the TimescaleDB docs for `time_bucket`, `first` and `last` before writing the query.
- Daily bars must align with M2's session boundary if phase 06 is done.

### 09 · Ownership checks (A1)
- Backend only (`apps/user`, `apps/auth`, `packages/errors`). No login UI.
- Independent of the UI and market-data phases; can be done at any point before phase 10.

### 10 · Guard and login (A2, A3)
- The two items ship together. Do not leave the branch in a state where endpoints are protected and no login exists.
- Decided: fetch-based stream reader (Q1), refresh token in an `httpOnly` cookie (Q2).
- Existing callers to route through the new API client: the bootstrap fetch, the `DetailPanel` snapshot fetch, and, if phases 07 and 08 are done, history, candles and the CSV download (blob fetch with the header).
- The stream hook must tell `401` (logged out) from `503` (retry) from a dropped connection (U4's banner).
- This is the largest phase. If it will not fit one session, finish A2's server side and the API client first, record exactly where you stopped under "Notes between phases", and leave the status `in progress`.

### 11 · Settings page (A4)
- Deleting an account cannot clean up portfolio data until phase 14 exists; record that as an open item rather than inventing a mechanism.
- The Preferences section stays empty until D3 and D4 exist.

### 12 · Search, feed controls, table view (D1, D2, D3)
- In that order; D3's header sort shares D1's sort state.
- "Sort by change" needs M2 (phase 06). If phase 06 is not done, leave that option out.
- D2 shows trade quantity. If the `quantity: 0` defect from the phase 06 brief is still open, stop and tell the owner before building that row format.
- S1's event ids do not exist until phase 17; keep the current feed row keys.

### 13 · Light theme and shortcuts (D4, D5)
- D4 first.
- D4 needs every colour to come from a token; grep for leftover `rgba(` and hex values before starting.
- D5's `p` and `v` shortcuts need D2 and D3 from phase 12; the `g s` shortcut and the theme control need the Settings page from phase 11.

### 14 · Portfolio service and watchlist (P1)
- Build the shared groundwork section of `06-personal.md` first, then P1.
- New app `apps/portfolio` on port 3006 (Q4). Add it to `scripts/dev.sh`, `.env.local.example` and the Vite proxy.
- **Ask the owner:** the plan's "Future issues" suggests starting with a `watchlists` table if multiple named lists are likely. Ask which before creating the table.
- Raise the account-deletion cleanup left open in phase 11.

### 15 · Price alerts (P2)
- Evaluated in the browser (Q7). The UI must say alerts are only checked while the app is open.
- The `snapshot` SSE event counts for alert evaluation.

### 16 · Paper trading (P3)
- Introduce the minimal migration runner first; the plan requires it before any money table.
- Rules are fixed (Q8): $100,000 cash, market orders, whole shares, long only, no fees.
- All money arithmetic in integer cents or a decimal type inside the portfolio service.
- Day P&L needs M2 (phase 06).

### 17 · Stream resilience (S1, S2)
- S2 first is easier: S1's resume is served from S2's ring buffer.
- S1's client watchdog replaces U4's temporary "no message for 15 s" rule.
- Feed row keys switch to event ids (D2 edge case).
- The token-expiry close from A2 takes precedence over the heartbeat.

### 18 · Retention and compression (S3 steps 2–6, M4 step 3)
- Order is fixed: create the candle continuous aggregates (M4 step 3) first, then enable retention. The reverse deletes history for good.
- Check the TimescaleDB docs for the current policy functions before writing them.
- **Open decision from phase 01, ask the owner:** no Kafka topic retention is set, so the broker default applies (7 days for Redpanda, to be confirmed against its docs). That is longer than the 24-hour idempotency marker, so a replay older than a day would double-apply ticks to Redis. Propose an explicit topic retention under 24 hours.
- Includes the retention ADR (step 6).

## Notes between phases

Each session appends here when it finishes: what the next phases need to know that is not in the plan files. Newest last.

### After phase 01 (2026-11-13)
- Implemented on `master`, not committed at the time of writing.
- Backend behaviour verified against a throwaway Redis. The browser "Done when" checks (30 distinct sparkline points after 30 s, empty feed on load, dialog Retry and quick symbol switching) were **not** run.
- Sparkline members are `<timestamp>:<price>`; the reader in the SSE service also accepts the old bare-price format. Helpers live in `packages/types`.
- `StreamQuote` gained `changeValue` (tick-to-tick).
- The marker cleanup script is `apps/consumer/scripts/cleanup-processed-markers.mjs` (`pnpm --filter @stock-platform/consumer cleanup:markers`, `--dry-run` to count). It removes only markers without an expiry.
- Open: Kafka retention versus the 24-hour marker (phase 18 brief). Open: feed rows carry `quantity: 0` and a guessed side (phase 06 brief).
