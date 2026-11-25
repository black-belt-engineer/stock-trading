# Phases

The roadmap cut into pieces that each fit one working session. `README.md` gives the reasons for the order; this file is the tracker. To run a phase, start a fresh chat and type **`/next-phase`** (or `/next-phase 14` for a specific phase). The skill is `.claude/skills/next-phase/SKILL.md`.

## Status

Statuses: `todo`, `in progress`, `done`. The next phase is the first row that is not `done`. Each phase is done on its own feature branch and ends with a pull request into `master`; a phase only counts as `done` for the next session once that pull request is merged.

| Phase | Items | Plan file | Needs | Status |
|---|---|---|---|---|
| 01 | B1, B2, B3, S3 step 1 | 01-bug-fixes.md, 07-streaming.md | — | done |
| 02 | U1 | 02-ui-foundation.md | 01 | done |
| 03 | U5, U4 | 02-ui-foundation.md | 02 | done |
| 04 | U2, U3 | 02-ui-foundation.md | 03 | done |
| 05 | M1 | 03-market-data.md | 03 | done |
| 06 | M2, M5 | 03-market-data.md | 05 | done |
| 07 | M3, M6 | 03-market-data.md | 05 | done |
| 08 | M4 | 03-market-data.md | 07 | done |
| 09 | A1 | 04-auth.md | — | done |
| 10 | A2, A3 | 04-auth.md | 03, 09 | done |
| 11 | A4 | 04-auth.md | 10 | done |
| 12 | K1, K2, K3, K4, K5 | 08-identity.md | 11 | done |
| 13 | D1, D2, D3 | 05-dashboard.md | 04, 06 | done |
| 14 | D4, D5 | 05-dashboard.md | 12, 13 | done |
| 15 | Portfolio service, P1, K6 | 06-personal.md, 08-identity.md | 05, 12 | done |
| 16 | P2 | 06-personal.md | 15 | done |
| 17 | Migration runner, P3 | 06-personal.md | 06, 15 | done |
| 18 | S1, S2 | 07-streaming.md | 12 | in progress |
| 19 | S3 steps 2–6, M4 step 3 | 07-streaming.md, 03-market-data.md | 08 | todo |

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
- Already done in phase 02: the flash, pulse, feed-row and skeleton animations stop under `prefers-reduced-motion` (`motion-reduce:animate-none`), and the card already carries `focus-visible` ring classes that take effect once U3 makes it focusable. U3 step 4 still has to decide whether "a static colour" needs more than the animation simply not running.
- Already done in phase 03: the sidebar nav is `NavLink`s with `aria-current` and padding, no `role="menuitem"`; the connection status is a `role="status"` polite live region; the dialog's close and Escape return to the list through the URL. Still open for U3: the card is still an `<article onClick>`, and focus return to the card after closing was not checked.
- Already done in phase 01: dialog width `min(420px, calc(100vw - 32px))` (U2 turns it into a full-screen sheet on narrow screens) and `aria-label="Close"` on the dialog close button (U3 step 7).
- Neither item can be verified by the type-checker. Check 360px, 768px and 1440px, and tab through the whole dashboard.

### 05 · Symbol registry (M1)
- The symbol list is in three places; after this phase it is in one.
- Phase 03 removed the dead sector pills and deleted the `FilterPills` component; this phase brings back real ones. `@radix-ui/react-toggle-group` is still a dependency for that. The symbol list to replace includes `SYMBOLS` in `apps/frontend/src/stream/StreamProvider.tsx`.
- A symbol with no ticks returns `null` prices and renders "—", not `$0.00`.
- The card's accessible name (U3, `PriceCard` `label`) is built from `formatPrice` and `changePercent`. With `null` prices it must say so (for example "AAPL, Apple Inc., no price yet"), not "$0.00, up 0.00%".

### 06 · Session stats and movers (M2, M5)
- M2 first; M5 is small and depends on it.
- **Ask the owner:** the plan offers two fixes for out-of-order delivery (key Kafka by symbol alone, or keep the key and ignore older ticks). Put both to the owner with a recommendation before coding; the first changes the idempotency contract.
- The atomic update (Lua or `WATCH`) must keep two phase 01 behaviours: the idempotency marker is written with a 24-hour expiry inside the same atomic step, and sparkline members stay `<timestamp>:<price>`.
- Phase 01 added `changeValue` (tick-to-tick) to `StreamQuote`. `DetailPanel` derives "Previous tick" from it and labels tiles "since start". After M2 these become real session values and labels (B3 step 6).
- **Known defect, raise it when changing `StreamQuote`:** the consumer builds the stream payload from the latest-price record, so every feed row has `quantity: 0` and a buy/sell side guessed from the price change. The real size and side are on the `PriceEvent`. Ask the owner whether to fix it here; D2 (phase 13) displays quantity and needs it.

### 07 · History and export (M3, M6)
- M3 first, then M6.
- Postgres access goes into the SSE service (plan step 1), not a new service.
- Auth does not exist yet, so the CSV download can be a plain link for now; phase 10 changes it to a blob fetch.

### 08 · Candle chart (M4)
- Steps 1, 2, 4, 5 and 6. Step 3 (continuous aggregates) is in phase 19.
- Hand-written SVG (README Q5); no charting library.
- Check the TimescaleDB docs for `time_bucket`, `first` and `last` before writing the query.
- Daily bars must align with M2's session boundary (phase 06 is done): take the bucket edges from `sessionStartFor` in `packages/symbols`, not from a hard-coded UTC day, so a real exchange calendar later moves both together.
- Postgres access already exists in the SSE service (phase 07): `app.db` from `dbPlugin`, and `TickRepository` / `TicksService` / `ticks.routes.ts` as the pattern for a read endpoint with TypeBox query schemas. Add the candle query there. `resolveTimeRange` in `models/tick-query.ts` caps a range at 24 hours, which suits raw ticks, not daily candles; give candles their own limits rather than widening it.
- The History page (`pages/HistoryPage.tsx`) has the symbol picker and range pills the Chart page will want; lift them into components instead of copying them.

### 09 · Ownership checks (A1)
- Backend only (`apps/user`, `apps/auth`, `packages/errors`). No login UI.
- Independent of the UI and market-data phases; can be done at any point before phase 10.

### 10 · Guard and login (A2, A3)
- The two items ship together. Do not leave the branch in a state where endpoints are protected and no login exists.
- Decided: fetch-based stream reader (Q1), refresh token in an `httpOnly` cookie (Q2).
- Decided by the owner (2026-11-16), before the phase started:
  - **Rate limits** (A3.9): fixed windows in Redis (`INCR` plus `EXPIRE` on the first hit). Keys use a sha256 of the lower-cased email, never the plain address.
    - `POST /auth/login`: 20 attempts per IP per 15 minutes, counting every attempt; 5 *failed* attempts per email per 15 minutes, from any IP. A successful login resets that email's counter.
    - `POST /users`: 5 registrations per IP per hour.
    - Over a limit: `429` with code `RATE_LIMITED` and a `Retry-After` header in seconds. The login page shows "Too many attempts, try again in N minutes". A blocked email gets the same answer whether or not the account exists.
    - Lockout by email is accepted as bounded (15 minutes at most); it is listed under A3's future issues.
  - **Stream expiry** (A2.5): just before closing at `exp`, the server sends `event: session-expired` (empty data). On that event the client refreshes and reconnects at once, with no backoff and no "Connection lost" banner. A close without that event is still a dropped connection.
  - **Key rotation**: out of scope. Leave it as an open item; nothing rotates keys today.
  - **`Secure` cookie flag**: on when `NODE_ENV === "production"`, with no separate flag. Q9 (reverse proxy) is unchanged.
  - **Clock skew**: 30 seconds of tolerance in the shared guard.
  - **CSRF header**: `X-Requested-With: fetch` is required on `/auth/refresh` and `/auth/logout`; without it the answer is `403`.
  - **Proactive refresh**: 60 seconds before `expiresIn` runs out.
  - **Tabs**: the Web Locks API (`navigator.locks.request("auth-refresh", …)`) makes the single-flight refresh hold across tabs. A `BroadcastChannel("auth")` shares the new access token, so a tab that waited on the lock uses it instead of refreshing again. It also carries logout: logging out in one tab logs out every tab.
  - **Session length**: refresh tokens stay at 7 days. No "remember me".
  - **After login or registration**: go to the validated requested URL, or `/` when there is none. No first-run screen.
  - **Login and register pages**: a centred card on the page background with the app name above it, built from `pageStyles.ts`. The only password hint is "At least 8 characters". There is no strength meter and no show-password toggle. Below the form: "There is no password reset yet. Keep your password somewhere safe."
  - **Splash**: during the startup refresh, a centred app name with a small spinner that appears only after 300 ms and does not animate under reduced motion. Never render the login page before that refresh has answered.
  - **Shell**: the user's name and a "Log out" button sit at the end of the shell's top bar. At narrow widths they move into the existing nav. *(The shell has no top bar; the owner moved them to the sidebar foot during the session, see the A3 notes.)*
  - **Tests**: add Vitest to `apps/frontend` and unit-test three pure modules: the event-stream parser (including chunk splits inside a line and inside a multi-byte character), the single-flight refresh (parallel `401`s give one refresh call; `403` and `503` never refresh), and the redirect-target validation (rejects `//evil.com`, `https://…`, `/\evil.com` and `javascript:`). The rest is verified by hand as in earlier phases.
  - **Splitting**: one phase, one PR. If it runs out of time, the fallback in the last bullet applies and the PR is opened as a draft; it is not merged until the login exists.
- Existing callers to route through the new API client: the symbol list fetch (now in `stream/useSymbolList.ts`, called by `StreamProvider`; a `401` there must also count as logged out), the tick history fetch (`fetchPage` in `hooks/useTickHistory.ts`), the CSV download, and the candles (`fetchCandles` in `hooks/useCandles.ts`; a `401` from its background refetches must also log out, not count as a failed refetch that is retried every 5 s). The CSV download is a plain `<a href download>` today (`ExportLink` in `pages/HistoryPage.tsx`); it becomes a blob fetch with the header, and must then show the server's `400` message (range over 24 hours, more than 100,000 rows) instead of a failed download.
- The stream hook must tell `401` (logged out) from `503` (retry) from a dropped connection (U4's banner). The hook is used only through `StreamProvider`; the router is React Router 7 in declarative mode (`BrowserRouter`), so the route guard is a layout route around the shell.
- From phase 09: `apps/user/src/plugins/internal-guard.ts` and `apps/auth/src/plugins/internal-guard.ts` are identical copies; move them into `packages/auth-guard` next to `createJwtGuard`. The API client must treat `403` (for example "Current password is incorrect", code `FORBIDDEN`) as a normal error, never as a reason to refresh or log out. A `401` from `/users/me` means the account is gone.
- This is the largest phase. If it will not fit one session, finish A2's server side and the API client first, record exactly where you stopped under "Notes between phases", and leave the status `in progress`.

### 11 · Settings page (A4)
- **Differs from the A4 plan since phase 09:** changing the email or password revokes *every* refresh token of the user, the caller's included (`PATCH /users/:id` revokes before it writes). The current access token keeps working until it expires, but the next refresh fails. After a successful credential change, log the user in again with the new credentials (or ask the owner whether to add a "keep this session" option to the revoke endpoint) instead of expecting the session to continue.
- `PATCH` needs `currentPassword` when `email` or `password` is in the body: `400` when it is missing, `403` when it is wrong. A body with only `currentPassword` is `400` ("Nothing to update").
- Deleting an account cannot clean up portfolio data until phase 15 exists; record that as an open item rather than inventing a mechanism.
- The Preferences section stays empty until D3 and D4 exist.
- From phase 10: log in again after a credential change with `useAuth().logIn(email, password)` (`auth/AuthProvider.tsx`); it sets the new cookie and tells the other tabs. The login limits apply to it (5 failures per email in 15 minutes). After a delete, call `useAuth().logOut()`: the server has already revoked the sessions, but that call clears the cookie and logs out the other tabs. A `403` from `PATCH` comes back from `apiFetch` as a plain response. The account controls are in `components/AccountControls`, at the sidebar foot; a Settings entry goes into `navItems.ts`.

### 12 · Keycloak and the BFF (K1, K2, K3, K4, K5)
- Added by the owner on 2026-11-16, after phase 11; the later phases were renumbered (old 12–18 are now 13–19). Branch: `feature/phase-12-keycloak`.
- Decided by the owner (2026-11-16), before the phase started: Keycloak replaces the hand-written auth; `apps/auth` and `apps/user` are deleted and Settings uses application-initiated actions (Q10); the tokens live in a backend-for-frontend, `apps/bff`, never in the browser (Q11); no migration of existing accounts (Q12). Login and register pages are Keycloakify pages in the app's design, plus "Sign in with Google".
- **Ask the owner first (Q13):** token handler (recommended: the BFF proxies API calls and the stream) or token-mediating backend (the page gets the access token). The plan is written for the token handler; K4 compares the two.
- **Ask the owner, before K4:** whether to encrypt the session value in Redis (AES-GCM, key from env).
- **Ask the owner, before K2:** which design is the reference. The plan assumes the phase 10 login and register pages (centred card, app name above, `pageStyles.ts`); if there is a separate mock-up, get it first.
- **Ask the owner, before K1's realm JSON:**
  - The name field. Keycloak's user profile has first and last name; the app has one "Name". Recommended: keep one field (Keycloak's `firstName`, labelled "Name", `lastName` removed from the profile), so the ID token's `name` is that field.
  - Password reset. Recommended: keep it off, as today (no SMTP). The alternative is Mailpit in compose plus `resetPasswordAllowed`, which also enables email verification later.
  - Maven. Keycloakify needs `mvn` and a JDK to build the JAR. Recommended: install them locally; the alternative is a Docker build stage.
- **Ask the owner, before K3:** where the Google button sits (above the form with an "or" divider is the usual pattern), and whether to hide it or leave Keycloak's provider disabled when `GOOGLE_CLIENT_ID` is empty. The owner creates the Google OAuth client; the redirect URI is in the plan.
- Code as it stands, for K5:
  - `packages/auth-guard/src/jwt-guard.ts` only allows `ES256`; Keycloak signs with `RS256` by default. It requires `sub` and `exp` and sets `authUserId` and `authExpiresAt`; keep that contract so `stream.routes.ts` and the future portfolio service do not change. The services keep verifying tokens even behind the BFF.
  - The guard is configured in `apps/sse-service/src/app.ts` from `AUTH_SERVICE_URL`, `JWT_ISSUER`, `JWT_AUDIENCE` (`config/index.ts`).
  - `openid-client` and `@fastify/reply-from` are new dependencies for `apps/bff`; check their current docs. The redirect validation in `src/auth/redirect.ts` (and its tests) moves to the BFF.
  - Frontend auth lives in `src/auth/` (`AuthProvider.tsx`, `session.ts`, `tabSync.ts`, `authApi.ts`, `credentials.ts`, `redirect.ts`, `RouteGuards.tsx`), `src/api/` (`client.ts`, `index.ts`, `account.ts`), the pages `LoginPage.tsx`, `RegisterPage.tsx`, `authForm.tsx`, `pages/settings/*`, and `components/AuthCard`, `components/Splash`, `components/AccountControls`. `RequireAuth` mounts `StreamProvider`; keep that.
  - `scripts/dev.sh` generates `JWT_PRIVATE_KEY` (via `apps/auth/scripts/generate-keys.mjs`) and `INTERNAL_API_TOKEN`; both blocks go, and `KC_BFF_CLIENT_SECRET` is generated instead. The Vite proxy has `/auth` and `/users` entries; they become `/bff` (with `/quotes` and `/stream`) → BFF and `/realms`, `/resources` → Keycloak.
  - `docs/openapi.yaml` and `scripts/api-docs.mjs` (`pnpm docs:api`) document and proxy the auth and user paths; update both in K5.
- Verify as in phases 10 and 11: headless Chromium at 360×740, 768×1024, 740×360 and 1440×900, axe on every theme page, two tabs plus a second context as "another device", a reload in Firefox with strict tracking protection, and a short access-token lifespan in the realm for the stream's `session-expired` path. Google needs real credentials: if the owner has not provided them, say the K3 "Done when" was not run. For K4, check that no token appears in browser storage, in `document.cookie` or in any response body, and test back-channel logout by ending the session in Keycloak's admin console.
- Splitting: K1–K4 do not touch the running app and may be reviewed first as a draft PR, like phase 10's two parts. K5 is not split: the branch must never have both logins half-working. One phase, one PR.
- K6 (account events) is not in this phase; only the realm setting that saves `DELETE_ACCOUNT` events is (K1).

### 13 · Search, feed controls, table view (D1, D2, D3)
- In that order; D3's header sort shares D1's sort state.
- "Sort by change" sorts by the day change (`changePercent`, against the previous close, phase 06). Symbols with `null` change sort last.
- The sector filter is already in the URL (`?sector=<id>`, phase 05), built in `QuotesPage` with `SectorFilter`. Add search and sort beside it as further params, and put D1's filter, search and sort into the one `useMemo` that today only filters by sector.
- D2 shows trade quantity: feed rows carry the real trade size (`quantity`) and side since phase 06.
- S1's event ids do not exist until phase 18; keep the current feed row keys.

### 14 · Light theme and shortcuts (D4, D5)
- D4 first.
- D4 needs every colour to come from a token; grep for leftover `rgba(` and hex values before starting.
- The candle chart (phase 08, `components/CandleChart`) already takes every colour from a token through `var(--…)` in SVG attributes, so it follows the theme. Check in the light theme: the last-price tag is `--text-inverse` on `--positive`/`--negative`, gridlines are `--border-subtle`, and the volume bars are the accents at 45% opacity.
- Phase 04 set dark-theme values for AA: `--text-secondary` `#7d89a4` and `--negative` `#f56674`. The light theme needs its own values checked the same way; the axe script approach in the phase 04 notes covers it.
- D5's `p` and `v` shortcuts need D2 and D3 from phase 13; the `g s` shortcut and the theme control need the Settings page from phase 11 (reshaped in phase 12).
- From phase 13, for D5: the feed's own pause flag (`pausedByUser`) is state inside `components/LiveFeed`, and the view comes from `useQuoteView()` called in `QuotesPage` (each call has its own state). A central handler needs both lifted (into `AppShell` or a small context). `/` can focus the search through `searchRef` in `QuotesPage` (`QuoteSearch` takes a `ref`); Chrome already clears a `type="search"` box on Escape. Cards and table rows are both `button[data-symbol]`, so arrow navigation can use one selector for either view.
- From phase 13, for the Preferences section: the view choice is stored in `localStorage` under `streamtick.quotes.view` (`cards` or `table`); without it phones get the table. A "default view" setting should write that key (or replace it), not add a second one.
- From phase 11: the Settings page has no Preferences section yet (owner decision: it comes with its first setting). D4 adds it in `pages/SettingsPage.tsx`, between Password and Danger zone, with `SettingsSection` from `pages/settings/fields.tsx`; D3's default view joins it there. *Since phase 12 the Profile, Password and Danger zone sections are buttons that start Keycloak actions; check where `SettingsSection` ended up.* Preferences stay in the browser or a future table: Keycloak is not the place for UI state. `/settings` is the route and the nav entry already exists.

### 15 · Portfolio service and watchlist (P1)
- Build the shared groundwork section of `06-personal.md` first, then P1.
- New app `apps/portfolio` on port 3006 (Q4). Add it to `scripts/dev.sh`, `.env.local.example` and the Vite proxy.
- Since phase 12 there is no `apps/user` to copy the structure from (the plan says to): follow `apps/sse-service` instead, with its guard setup against Keycloak's keys. `user_id` is the Keycloak `sub`, a UUID, so the planned `UUID` columns stay.
- The browser reaches the portfolio service only through the BFF: add `/portfolio/*` to the BFF's proxy routes and point the Vite proxy's `/portfolio` at the BFF, not at port 3006.
- **Ask the owner:** the plan's "Future issues" suggests starting with a `watchlists` table if multiple named lists are likely. Ask which before creating the table.
- K6 (`08-identity.md`): decided by the owner (2026-11-16, Q14): a Keycloak event listener publishes account deletions to the Kafka topic `identity.events`, the portfolio service consumes it, and a nightly cleanup (service account with `view-users`) removes anything missed. Build P1's tables first, then K6. It needs Maven like the theme, and its JAR is mounted next to the theme's.

### 16 · Price alerts (P2)
- Evaluated in the browser (Q7). The UI must say alerts are only checked while the app is open.
- The `snapshot` SSE event counts for alert evaluation.
- From phase 15: `price_alerts` goes into `apps/portfolio` next to `watchlist_items` (repository with `prepareSchema`, routes inside the guarded scope, user id from `userIdOf(request)`). Add the table to `UserDataRepository.deleteUser` and `listUserIds`, or K6 will not delete a deleted user's alerts. Serialise a user's writes with `lockUser` (advisory lock) where a cap is checked (50 active alerts). The browser calls `/portfolio/alerts…` through the BFF; nothing else to wire. In-app messages can reuse the shell's notice slot pattern (`WatchlistNotice`, a polite `role="status"` inside `main`).

### 17 · Paper trading (P3)
- Introduce the minimal migration runner first; the plan requires it before any money table.
- Rules are fixed (Q8): $100,000 cash, market orders, whole shares, long only, no fees.
- All money arithmetic in integer cents or a decimal type inside the portfolio service. Phase 16 has string-based helpers for two-decimal amounts (`centsOf`, `formatCents`, `PRICE_PATTERN` in `apps/portfolio/src/models/alert.ts`, mirrored in `apps/frontend/src/alerts/money.ts`); `avg_cost` has four decimals, so extend rather than reuse them as they are.
- Day P&L uses M2's `previousClose` (phase 06); a position opened today is measured from its fill price instead.
- From phase 15: the portfolio service exists (`apps/portfolio`, port 3006, behind the BFF) and already has `app.redis` for `price:latest:<symbol>`. The migration runner must take over `watchlist_items` and, since phase 16, `price_alerts` (both created today by `CREATE TABLE IF NOT EXISTS` in their repository's `prepareSchema`, the alerts with two partial indexes). Every new table joins `UserDataRepository` (K6 deletes a deleted user's rows from every table in one transaction): **the owner must decide** whether orders are deleted or anonymised then (plan "Future issues"); today the code deletes. `withTransaction` and `lockUser` in `repositories/transaction.ts` fit the order transaction.
- The Vite proxy sends `/portfolio/` (with the slash) to the BFF, so the page `/portfolio` stays the SPA's. A page route under `/portfolio/…` would be proxied instead: keep P3's pages at `/portfolio` only, or rename the API prefix.

### 18 · Stream resilience (S1, S2)
- S2 first is easier: S1's resume is served from S2's ring buffer.
- S1's client watchdog replaces U4's temporary "no message for 15 s" rule (`SILENCE_LIMIT_MS` in `usePriceStream.ts`). With the ingestor down that rule reconnects every 15 s; a heartbeat ends that.
- Feed row keys switch to event ids (D2 edge case).
- The token-expiry close from A2 takes precedence over the heartbeat.
- From phase 16: price alerts are evaluated in the browser on every change of `useStreamData().prices`, the connection's `snapshot` event included (`alerts/AlertsProvider.tsx`, `AlertEvaluator`). A resume must still put the latest price per symbol into `prices` (a snapshot or the replayed events), or a crossing during the gap is caught only at the next tick. S2 is also what the plan's server-side alert worker would build on (P2 "Future issues").
- Since phase 10 `StreamProvider` is mounted by the route guard (`auth/RouteGuards.tsx`, `RequireAuth`), not in `main.tsx`: it exists only with a session, and logging out unmounts it (phase 12 keeps this; the stream then runs through the BFF, which refreshes the token, so S1's resume request must pass the BFF's proxy unchanged, including `Last-Event-ID`). A resume after a logout and login is a fresh connection, not a resume.
- The Chart page (phase 08) refetches its last two candles when `useStreamStatus().status` goes from `live` to something else and back. With S1's resume the refetch becomes unnecessary but stays harmless; keep the status transitions as they are or update `useCandles`.

### 19 · Retention and compression (S3 steps 2–6, M4 step 3)
- Order is fixed: create the candle continuous aggregates (M4 step 3) first, then enable retention. The reverse deletes history for good.
- Check the TimescaleDB docs for the current policy functions before writing them.
- **Open decision from phase 01, ask the owner:** no Kafka topic retention is set, so the broker default applies (7 days for Redpanda, to be confirmed against its docs). That is longer than the 24-hour idempotency marker, so a replay older than a day would double-apply ticks to Redis. Propose an explicit topic retention under 24 hours.
- Includes the retention ADR (step 6).
- From phase 08, for the continuous aggregates: candles are read by `CandleRepository.aggregate` (`apps/sse-service/src/repositories/candle.repository.ts`). Fixed widths use `time_bucket(width, time, TIMESTAMPTZ 'epoch')`; `1d` groups by explicit session starts from `packages/symbols` with `width_bucket`, which a continuous aggregate cannot express. So build only the `1m` aggregate (and maybe `1h`), and roll `1d` up from it with the same session-start array. The aggregate must also store `max(time)` per bucket: the response's `lastTradeAt` is what stops the browser counting a streamed trade twice. The open bucket is not materialised yet, so keep real-time aggregation on (`materialized_only = false`) or read the open bucket from raw ticks.

## Notes between phases

Each session appends here when it finishes: what the next phases need to know that is not in the plan files. Newest last.

### After phase 01 (2026-11-13)
- Implemented on `master`, not committed at the time of writing.
- Backend behaviour verified against a throwaway Redis. The browser "Done when" checks (30 distinct sparkline points after 30 s, empty feed on load, dialog Retry and quick symbol switching) were **not** run.
- Sparkline members are `<timestamp>:<price>`; the reader in the SSE service also accepts the old bare-price format. Helpers live in `packages/types`.
- `StreamQuote` gained `changeValue` (tick-to-tick).
- The marker cleanup script is `apps/consumer/scripts/cleanup-processed-markers.mjs` (`pnpm --filter @stock-platform/consumer cleanup:markers`, `--dry-run` to count). It removes only markers without an expiry.
- Open: Kafka retention versus the 24-hour marker (phase 19 brief). Open: feed rows carry `quantity: 0` and a guessed side (phase 06 brief; fixed in phase 06).

### After phase 02 (2026-11-13)
- U1 is complete: no component has a `style` prop, and `global.css` has no component classes left (`.mono`, `.card-surface`, `.flash-*`, `.text-muted` are gone).
- Verified in headless Chromium at 1440px against the running stack (`pnpm dev:all`): computed styles and bounding boxes of every element were compared before and after each component's conversion, and hover, tab focus, pill states, the dialog's loading and error states and reduced motion were exercised. Other widths were not checked; layout at narrow widths is unchanged and still U2's job.
- Token names now: `--accent-brand`, `--accent-brand-dim`, `--positive`, `--negative`, `--warning`; new `--bg-overlay` and `--dialog-shadow`. The old `--accent-teal/lime/green/red/amber` no longer exist.
- Tailwind classes come from the `@theme inline` block in `global.css`. Backgrounds, text and borders use per-property namespaces, so the classes are `bg-{base,surface,elevated,sidebar,input,overlay}`, `text-{primary,secondary,muted,inverse}` and `border-{subtle,default,strong}`. Accents work with any utility: `brand`, `brand-dim`, `positive`, `negative`, `warning` (for example `text-positive`, `bg-negative/15`, `outline-brand`). Also `shadow-card`, `shadow-dialog`, `font-mono`, and `animate-{flash-up,flash-down,pulse-live,pulse-reconnecting,skeleton,feed-in}`.
- Conventions the conversion follows, worth keeping: font sizes are arbitrary pixel values (`text-[11px]`) because the named sizes (`text-xs`) also set a line height and the body is 13px/1.4; a dynamic class is picked from a map of complete class strings, never assembled from parts, or Tailwind's scanner misses it; the focus ring is `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`.
- Do not add plain CSS rules to `global.css` outside an `@layer`: unlayered CSS beats every Tailwind utility. The old `.card-surface` would have overridden `shadow-*` and `bg-*` on the same element.
- Buy/sell badges in the feed are now `--positive`/`--negative` (were brand lime/red), matching the cards.
- Not done, by the plan's own condition: the dialog overlay keeps `backdrop-filter` under reduced motion. The plan says to drop it only "if it stutters", which could not be measured here.
- Defects noticed outside the scope, not fixed:
  - `Sparkline` maps prices to between 30% and 110% of its height, so the lowest part of every line is clipped and the line shows gaps. The offset should be subtracted, not added (`Sparkline/index.tsx`, the `y` formula).
  - The sidebar nav buttons have no horizontal padding, so "Quotes" touches its border. Kept as it was to avoid a layout change; U5 rebuilds the navigation.
  - The sidebar buttons have `role="menuitem"` without a parent `menu` role (U3/U5).
  - In the dialog the sparkline colour (first point versus last) can disagree with the change line above it (tick-to-tick), for example a red chart under a green "+0.26%". M2 makes the change a session value, which should resolve it.

### After phase 03 (2026-11-13)
- Decided by the owner: the router is **React Router** (v7, declarative mode: `BrowserRouter`, `Routes`, `NavLink`). README Q6 is closed.
- Routes today: the index route (quotes) and a catch-all 404, both inside the `AppShell` layout route (`components/AppShell`), which holds the sidebar, the stale banner and the live feed. `/chart`, `/history` and `/settings` give the 404 until M4, M3 and A4 add them, and their nav items come back with them.
- The stream lives in `StreamProvider` (`src/stream/`), above the routes. It exposes two contexts: `useStreamStatus()` (status, attempts, `nextRetryAt`, the debounced `stale` flag, `retry`) and `useStreamData()` (prices, feed). A component that only shows status does not re-render on ticks. Verified: one `/stream` request across client-side navigation.
- Dialog URL: `/?symbol=AAPL`. Opening from a card pushes an entry marked `{ openedFromList: true }` in history state; closing then calls `navigate(-1)`, so close and Back agree. A dialog reached from a link closes by replacing the URL. Other search params are kept, ready for D1. `useNavigate` is not stable in declarative mode, so `QuotesPage` reads it through a ref to keep `onOpen` stable for `memo(PriceCard)`.
- U4 choices the plan left as "a threshold": stale banner after 3 s not live (debounced), card "Delayed" after 5 s without a tick on a live stream (5 missed simulator ticks; `DELAYED_AFTER_MS` in `PriceGrid`). Delayed markers are hidden while the banner shows; the banner and dimmed cards cover that case.
- The dialog's temporary "values may be out of date" line is replaced by the same `StaleBanner` in compact form, and the price dims.
- Outside the plan: `vite.config.ts` now closes the browser's `/stream` response when the upstream response closes. Without it the dev proxy kept the stream open after the SSE service died, and U4's "Done when" could not be met in development. A production reverse proxy (Q9) has to do the same; check it when that is built.
- Verified in headless Chrome at 1440px against `pnpm dev:all`, scripted: nav and `aria-current`, open/close/Back/Escape, lowercase normalisation, refresh with the dialog open, unknown symbol, 404, stream count across navigation; loading skeleton, error and Retry, empty list, "—" and "Waiting for trades…" (mocked responses); SSE service killed → banner after 3.4 s, cards dimmed, dialog banner, restart clears it; ingestor stopped → all six cards "Delayed" after 5 s, no banner through a watchdog reconnect, cleared after restart. Not checked: other widths (U2), screen reader output, the `online` event, laptop sleep.
- Fixed in passing: the sidebar nav padding and `role="menuitem"` (both from the phase 02 notes).
- Defects noticed outside the scope, not fixed:
  - The SSE service's SIGTERM shutdown stops listening but keeps open streams alive and does not exit while a client is connected; `tsx watch` then force-kills it and wedges, so the service does not restart on file changes until `pnpm dev:all` is restarted. The shutdown should end open streams (S1 or S2).
  - The banner says "Connection lost" on first load when the stream has never connected; "Cannot reach the price stream" would be more accurate.
  - The phase 02 notes' `Sparkline` clipping and colour-disagreement defects are still open.

### After phase 04 (2026-11-13)
- Decided by the owner: breakpoints are Tailwind's `md` (768px) and `xl` (1280px). Narrow is below 768, medium is 768–1279 (icon rail, feed drawer) and wide is 1280 and up (three columns). The narrow "feed tab" is shell state in `AppShell` (`feedOpen`), not a route. The same state is the medium drawer. A pathname change closes it. Under reduced motion the price flash is simply not shown (no colour substitute); the change badge already carries direction.
- Decided by the owner, changes U4: the stale state turns cards and the dialog price **greyscale** instead of 50% opacity. Opacity took their text to 2.2–4.4:1 while the cards stay clickable.
- Layout facts for later pages: the shell is `h-dvh` with independently scrolling regions; a page renders inside `main`, which scrolls. Nav items live in `components/navItems.ts`, shared by the sidebar and the bottom tab bar. A new page (M3, M4, A4) adds its entry there, with an icon in `components/icons.tsx` (hand-written 20×20 SVG). On the rail labels are `sr-only` and shown as `title`. Responsive classes use `md:max-xl:` for medium-only styles.
- Contrast changes beyond plan step 1, both needed for "all text passes AA": `--negative` `#f0485a` → `#f56674` (the red change badge on its own 15% tint was 4.25:1, 3.92:1 on a hovered card), and the stale banner's countdown is `text-primary` (secondary was 4.38:1 on the amber tint inside the dialog). The `text-muted` utility no longer exists; `--text-muted` stays as a token for decoration.
- The card's accessible name is the plan's ("AAPL, Apple Inc., $228.50, up 0.12%", plus ", no recent updates" when delayed). axe's `label-content-name-mismatch` flags it because the visible "▲ +0.12%" is not literally in the name; the name starts with the visible symbol, which is what WCAG 2.5.3 needs. Kept as the plan says.
- Focus return: the dialog has no Radix `Trigger`, so Radix focused nothing on close. `DetailPanel` now focuses `[data-symbol=…]` in `onCloseAutoFocus`. Any new control that opens the dialog without being a card gets the card's focus, not its own; give it a trigger or extend that lookup.
- Fonts: variable WOFF2, latin subset, from Fontsource 5.3.0, in `public/fonts` with their OFL licences, preloaded in `index.html`. The ▲/▼ arrows are not in the subset and fall back to a system font, as they did with Google Fonts.
- Verified in headless Chrome against `pnpm dev:all` (scripted Playwright, axe-core 4.14):
  - No horizontal scroll at 360×740, 768×1024, 1440×900, 720×450 (1440 at 200% zoom) and 740×360 (phone landscape).
  - The feed toggle is visible at every one of those sizes. The drawer opens, takes focus and closes with Escape or the backdrop, with focus back on the toggle. The feed tab replaces the page and back.
  - A route change closes both. Long company names truncate with a `title`; a six-figure price fits at 360px.
  - The dialog is a full-screen sheet below 768px.
  - Keyboard alone: the tab order reaches every control at each width; Enter and Space open a card. Escape and the Close button return focus to the card, also for a dialog opened by URL.
  - axe `color-contrast` passes with motion reduced on the dashboard, a hovered card, the feed (tab and drawer), the dialog, the 404 page and the stale state (dashboard and dialog). Without reduced motion, the newest feed row fails only during its 200 ms fade-in.
  - Fonts load from the app's own origin, with no external requests.
- Not checked: a real phone (safe-area inset, `dvh` with browser chrome), a real screen reader, Safari/Firefox, light theme (does not exist yet).
- Defects noticed outside the scope, not fixed:
  - While the narrow feed tab is showing, `main` is hidden, so the page has no main landmark (axe `landmark-one-main`, moderate). Making the feed tab a route was declined; a fix would be to render the feed inside `main` on narrow screens.
  - Feed B/S badges are read as the letters "B" and "S"; a visually hidden "buy"/"sell" would help (D2 rebuilds the row).
  - Phone landscape (360px tall) leaves about 250px for content between the header row and the tab bar; usable, but a compact header there would help.
  - Still open from earlier notes: `Sparkline` clipping, the sparkline/change colour disagreement, SSE shutdown wedging `tsx watch`, and "Connection lost" on a first load that never connected.

### After phase 05 (2026-11-13)
- Decided by the owner: the registry is a new package, `packages/symbols` (`SYMBOL_REGISTRY`, `findSymbol`, `SYMBOL_PATTERN`, `isValidSymbolFormat`); the sector filter lives in the URL as `?sector=<id>` (`health-care`, from `sectorId()` in `components/SectorFilter`); a malformed symbol gets `400 VALIDATION_ERROR`, a well-formed unknown one `404 NOT_FOUND`, and one bad entry in `/stream?symbols=` rejects the whole request before any SSE header is sent.
- 18 symbols in 7 sectors, including `BRK.B`. The ingestor now stamps each tick with the registry's exchange (was always `NASDAQ`). Discovery takes `name` from the registry, not from the stored tick.
- Adding a symbol in an existing sector is one line in `packages/symbols/src/index.ts`. A new sector also needs its name in the `Sector` union in the same file (kept for typo safety; a typo would otherwise add a second pill). Packages are not watched in `pnpm dev:all`: run `pnpm --filter @stock-platform/symbols build` (or `pnpm build`) and the `tsx watch` services pick it up.
- Discovery returns `null` for `currentPrice`, `changePercent`, `changeValue`, `high24h`, `low24h`, `volume24h` and `lastUpdated` when a symbol has no ticks. In the frontend `ActiveStock` the price fields are `number | null`, but `lastUpdated` stays a number with `0` meaning never. `formatPrice`, `formatChange` and `formatVolume` take `null` and return "—" (`NO_VALUE`). Anything new that reads these fields (M2 tiles, D1 sort, D3 table, M5 movers, P3) has to handle `null`; sort them last.
- A card with no price shows "—", a neutral badge, no "Delayed" marker, and the accessible name "ORCL, Oracle Corporation, no price yet". The dialog shows "No trades yet" and "No data yet" (snapshot 404).
- `/quotes/:symbol/snapshot` still answers 404 both for an unknown symbol and for a registered symbol with no ticks; the `code` is `NOT_FOUND` in both and only the message differs. The frontend only asks for symbols in the list, so it reads 404 as "no data yet".
- Frontend structure change: `StreamProvider` now owns the symbol list (`useSymbolList`), opens the stream only once the list has symbols (sorted, stable identity across list reloads), and keeps the merged live `stocks`. `useStreamData()` returns `{ prices, feed, stocks, listStatus, retryList }`; `QuotesPage` no longer fetches. When the list fails, no stream is opened, the status is "Disconnected" and the stale banner stays off. A reload with the list loaded resets `stocks` while rendering, not in an effect: an effect left one render with a ready list and no stocks, which stripped `?sector=` on reload.
- Radix `ToggleGroup` with `type="single"` renders `role="radio"` items with `aria-checked` in a `role="group"` labelled "Filter by sector". It is one tab stop, and the arrows move between pills. Sector changes replace the history entry. On narrow screens the row scrolls sideways and scrolls the selected pill into view.
- Verified against `pnpm dev:all`: with curl, discovery (18 entries, sector, exchange), snapshot 200/404/400 (`aapl`, `BRK.B`, `ZZZZ`, `1ABC`, `A B`, 14 characters), `/stream` 404 and 400 as JSON, empty `symbols=` streams everything, duplicates collapse. In headless Chrome (Playwright, axe-core 4.14, reduced motion) at 360×740, 768×1024 and 1440×900: the list request completes before the one `/stream` request, which names all 18 symbols; no horizontal page scroll; Financials shows JPM, BAC, V, BRK.B and the top bar counts 4; reload keeps `?sector=`; open and close a dialog under a filter keeps it and returns focus to the card; `?sector=energy&symbol=AAPL` opens AAPL's dialog; an unknown sector is removed from the URL; keyboard selection of pills; axe clean on the filtered and full dashboard. "Done when": with the ingestor paused, one added line (ORCL) appeared in discovery, the stream query, the Technology filter and the grid as "—"; after resuming the ingestor it got prices and appeared in the feed. The test line was removed afterwards. List failure (mocked 500) and Retry checked. Phase 04's keyboard and focus-return script still passes.
- Decided by the owner during review: **no `any`, no non-null `!`, no `as` casts anywhere in the repo.** All 16 existing ones were removed in this phase.
  - JSON from outside the process is checked, not cast. `PriceEvent`, `LatestPrice` and `StreamQuote` are TypeBox schemas in `packages/types`, with their types inferred from them; `parseJson(schema, text)` returns the typed value or `null`. Auth has `userSummarySchema`. The frontend uses `isRecord` and `finiteOrNull` from `utils/guards.ts`.
  - Changed behaviour:
    - A Kafka message that is valid JSON but the wrong shape now fails in the consumer like invalid JSON already did. The message is not committed and is retried. Not tested by injecting one.
    - A latest-price record in Redis of the wrong shape counts as absent. The SSE service returns 404 for it, and the consumer rebuilds it from the next tick, which resets high, low and volume.
    - A malformed stream entry is skipped.
    - A malformed stored refresh entry is an unknown token (401).
    - A user service response of the wrong shape is a 502.
    - A malformed snapshot shows the dialog's error state.
  - Verified against `pnpm dev:all`:
    - Snapshot and stream work end to end.
    - Bad entries injected into `price:updates` are skipped while the stream continues.
    - A corrupted `price:latest:AAPL` gives a 404 until the next tick.
    - Auth: register, login, refresh, single use, the JWT guard with a good and a bad token, and both services' 400 validation responses; a corrupted refresh entry gives 401.
    - The browser checks above were re-run, plus the dialog tiles and a mocked malformed snapshot.
- Not checked: a real phone, a screen reader, Safari/Firefox, the Dockerfiles (`packages/symbols` was added to the ingestor's and SSE service's, but no image was built).
- Defects noticed outside the scope, not fixed:
  - The Dockerfiles of the SSE service, ingestor and consumer do not copy all their workspace dependencies (`errors`, `schemas`, `redis` for the SSE service), so the images probably do not build. Not tried.
  - The narrow feed tab's scrolling list fails axe `scrollable-region-focusable` (serious): it can be scrolled but holds nothing focusable. D2 rebuilds the feed.
  - With 18 symbols the feed scrolls by ~18 rows a second, and without reduced motion axe catches several rows mid fade-in (contrast). Same cause as the phase 04 note; more visible now. D2's pause control would help.
  - Still open from earlier notes: `Sparkline` clipping, the sparkline/change colour disagreement, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, no main landmark on the narrow feed tab.

### After phase 06 (2026-11-13)
- Decided by the owner:
  - Out-of-order ticks: the Kafka key stays `symbol:timestamp` (idempotency contract unchanged). A tick not newer than the stored `lastUpdated` does not move price or change. If it is from the same session it still counts toward day volume, high and low. It is always stored in Postgres and gets no stream entry.
  - The `quantity: 0` defect is fixed. `StreamQuote.quantity` and `side` are the trade's own, also in the SSE `snapshot` event (from `lastSize`/`lastSide` in the record).
  - The atomic update is a Lua script (`apps/consumer/src/repositories/apply-tick.lua.ts`, run through ioredis `defineCommand`).
  - The ingestor reads `price:latest:<symbol>` at startup and continues from it. Only `currentPrice` is checked, so older record formats work too.
  - The detail dialog no longer fetches `/quotes/:symbol/snapshot`. Its tiles (Open, Previous close, Day high, Day low, Day volume, Last updated) come from the live stock, so they move every tick and reset when a new session arrives. The loading, error and Retry states for that fetch are gone. The endpoint still exists with the new fields.
- Data shapes now:
  - `LatestPrice` (Redis) has `sessionId`, `currentPrice`, `previousClose`, `open`, `high`, `low`, `volume`, `change`, `changePercent`, `tickDirection` (`up`/`down`/`flat`, for the flash only), `lastSize`, `lastSide` and `lastUpdated`. The old `previousPrice`, `changeValue`, `high24h`, `low24h` and `volume24h` are gone everywhere.
  - `StreamQuote` carries the same day values plus `quantity`, `side` and `timestamp`.
  - Discovery entries carry the day values as `null` before the first tick, and `tickDirection` `null`.
  - The frontend `ActiveStock` and `LiveQuote` share a `DayValues` type. A quote replaces all day values at once; the client never computes any.
- Contract change: entries in the `price:updates` Redis stream now hold the `LatestPrice` record in `payload`, not a `StreamQuote`. The SSE service maps them with `streamQuoteFromLatest`, so the record-to-quote mapping lives in one place. Entries in the old format are skipped. S1 (phase 18) resumes from these entries.
- The market calendar is `sessionIdFor` / `sessionStartFor` in `packages/symbols` (one UTC day, README Q3). The session comes from the event timestamp, never the processing time.
- Cold start: a missing or unreadable record makes the script return `needs_baseline`. The consumer then reads two things from `stock_ticks` and runs the script once more: the last price before the session (the previous close) and the session's open, high, low and volume so far. **Departure from the plan:** step 5 only asks for the previous close. Taking the session so far as well means a Redis flush, or this deploy (every record was in the old format), does not restart the day's high, low and volume at the moment of the deploy. With no earlier tick at all, the first price is the previous close (0%).
- `stock_ticks` has a `source` column (`fake` now); older rows have `NULL`.
- M5: the Topbar's Best/Worst tiles are replaced by "Top movers · all sectors" (the strip ignores the sector filter):
  - Content: up to three gainers (change > 0 after rounding to two decimals) and three losers (< 0), ties broken by symbol, "—" when a list is empty. A symbol is never in both lists.
  - Refresh: at most every 3 s, the first change after a quiet period at once.
  - A mover's accessible name is its visible text plus a hidden "today"; the arrow is hidden.
  - Clicking opens the dialog.
  - `DetailPanel` now returns focus to whatever control opened it (card or mover), falling back to the card, so a new control that opens the dialog gets its own focus back. This replaces the phase 04 note's "give it a trigger or extend that lookup".
- The card's change badge and accessible name are the day change ("…, up 0.12% today"). The flash follows `tickDirection`, so a red flash under a green badge is correct.
- Verified against `pnpm dev:all`:
  - Every branch of the script, against a scratch Redis database:
    - cold start with and without a baseline, same session, duplicate
    - an older tick in the same session (counts toward low and volume, price unchanged)
    - 23:59:59.999 then 00:00:00.001 (new session, previous close = last price)
    - a late tick from the previous session (ignored)
    - a gap of a whole session, a malformed record, the zero previous-close guard
    - the 24 h marker TTL
  - 200 ticks, each delivered twice from four Redis clients in random order: every tick counted once (volume 200), the record ends on the newest tick.
  - Live data:
    - the stream carries real quantity and side
    - consecutive same-direction ticks move the badge steadily
    - `source` is stored
    - two consumer restarts left open, previous close, high and low unchanged and volume continuous
    - an ingestor restart resumed all 18 prices, with no step above 0.6% across it
  - Browser (headless Chromium, Playwright 1.57, axe-core 4.14, reduced motion) at 360×740, 768×1024 and 1440×900:
    - no horizontal scroll; the strip changes at most every ~3 s while cards tick
    - a mover opens its dialog with live tiles, and Escape returns focus to the mover
    - movers ignore the Energy filter; card Enter/Escape, click/Close and opened-by-link focus return still work
    - with the stream blocked the movers equal the top three by card badge
    - mocked lists cover ties, zero and +0.001% changes ("—") and a symbol with no ticks ("No trades yet", "No data yet", "no price yet")
    - a mocked quote with a new `sessionId` resets the dialog tiles from its payload
    - axe is clean on the dashboard and the dialog, apart from the cards' known `label-content-name-mismatch` (phase 04)
- Not checked: a real midnight (the boundary was tested in the script and with a mocked quote), the Dockerfiles (`packages/symbols` was added to the consumer image and `packages/redis` to the ingestor image, but none was built), a real phone, a screen reader.
- Left open, small:
  - An out-of-order tick of the same session that is older than the tick the open came from does not move `open`; the record does not keep the open's time.
  - A cold start can count a tick twice in one rare case: a tick already in Postgres whose Redis update has not happened yet is in the baseline, and is counted again when it reaches Redis as an "older" tick.
  - If Redis is down when the ingestor starts, ioredis retries for a while before the ingestor falls back to the seeds.
  - The random walk drifts ±10% within a day (plan "Future issues": mean reversion).
- Defects noticed outside the scope, not fixed:
  - The `Sparkline` colour (first versus last of 30 points) still disagrees with the day change in the dialog and on cards. M2 did not resolve it, contrary to the phase 02 note's guess, because they cover different time spans. The clipping defect is also still open.
  - Still open from earlier notes: SSE shutdown wedging `tsx watch`, "Connection lost" on a first load that never connected, no main landmark on the narrow feed tab, the feed tab's `scrollable-region-focusable`, Dockerfiles missing workspace dependencies.

### After phase 07 (2026-11-13)
- No owner decisions were needed. Choices the plan left open, made here:
  - The history API lives in the SSE service, as the brief says. It needs `DATABASE_URL` now; the service README calls it the "market API".
  - Ranges are `from` inclusive, `to` exclusive. A missing `to` is now, a future one is clamped, and a missing `from` is 15 minutes before `to`.
  - The response echoes the range it used (`{ symbol, from, to, ticks, nextCursor }`). The client pages on and exports with exactly those values.
  - The cursor is base64url of `[time, idempotency_key]`. The time is the exact Postgres text with microseconds, so a millisecond rounding in JavaScript can never skip or repeat a row.
  - Unknown query parameters are dropped, not rejected (Fastify's default `removeAdditional`).
  - CSV:
    - columns `time,symbol,price,size,side`, oldest first (the page is newest first)
    - file name `AAPL_20261113T145651Z_20261113T155651Z.csv`
    - at most 100,000 rows, checked with a `count(*)` before any header is sent, so an over-large range still gets a JSON `400`
    - read from a `pg-cursor` in batches of 500
  - Frontend:
    - route `/history/:symbol?range=…` with presets 15 min (default, no param), 1 hour, 4 hours and 24 hours
    - changing the symbol pushes a history entry; changing the range replaces it (like the sector filter)
    - symbols are grouped by sector in a native `<select>`
    - a symbol not in the list is "not found" without a request
  - Live mode (plan edge case): turning it on reloads the range up to now, then prepends this symbol's trades from the feed that are newer than every row shown. The consumer writes Postgres before the stream entry, so that rule cannot duplicate a row. For the same reason the table cannot lag the cards, and the plan's "consumer lag" caption was not needed. The export covers the queried range, not the live rows, and the caption says so.
- Fixed in passing (needed for M3): the SSE service's error handler turned Fastify schema-validation errors into `500`. They are now `400 VALIDATION_ERROR`, as in the user service.
- `navItems` entries have an `end` flag, so "History" stays active on `/history/AAPL`. `pillClass` is exported from `SectorFilter` for other pill groups.
- Verified against `pnpm dev:all`:
  - With curl:
    - `aapl`, `BRK.B`
    - `404` for `ZZZZ`; `400` for `1ABC`, `limit` 0/1001/abc, a non-ISO or zone-less `from`, `from` after `to`, a range over 24 h and a garbage cursor
    - a future `to` clamped; an empty range gives `200 []` with no cursor
  - Paging:
    - 11 rows with identical timestamps (inserted, then removed) paged at limits 2 and 3 with no repeats
    - one live hour of AAPL paged at limit 97: 1,124 rows, all distinct, equal to SQL's count, while ticks kept arriving
  - Performance (scratch database `stockdb_perf`, dropped afterwards; 1.56 M rows = 18 symbols × 24 h at 1/s, TimescaleDB hypertable):
    - a 24-hour page of 1,000 rows: 16 ms over HTTP (134 ms on the first request); Postgres 1.3 ms through the `(symbol, time DESC)` index
    - the second page also 16 ms
  - CSV:
    - a 24-hour export of 86,296 rows matched SQL's count, 4.9 MB in 1.2 s
    - server RSS stayed flat at about 118 MB through a download throttled to 300 kB/s
    - 12 downloads aborted mid-stream (more than the pool's 10 connections) left no active connection, and the next export worked
    - an empty range gives the header only; 106,251 rows gives `400`
  - In headless Chromium (Playwright 1.57, axe-core 4.14, reduced motion):
    - `/history` prompts for a symbol; picking AAPL loads it
    - 1 hour paged by keyboard (Enter on "Load more") to the end: 1,487 rows in 3 pages, all distinct; focus lands on "Start of the range reached"
    - the downloaded CSV had the same 1,487 rows
    - Live added about one row a second, newest first, no duplicates
    - `/history/aapl` normalised; `/history/ZZZZ` gives "not found"
    - mocked: an empty range, a `500` with Retry, a failed "Load more" (rows kept, message shown), a failed symbol list
    - range pills by arrow keys; Back after a symbol change; sticky table header
    - nav `aria-current` at 360, 1024 and 1440
    - no horizontal scroll at 360×740, 768×1024, 1440×900 and 740×360
    - axe clean on the History page
- Not checked: a real phone, a screen reader, Safari/Firefox, a real browser's download UI (only Playwright's download event), the Dockerfile (`packages/db` added to the SSE service image, not built).
- Left open, small:
  - The SSE service's readiness check covers Redis only. With Postgres down, history fails with `500` while the service reports ready. Adding the check would also take streaming out of rotation, so it is a choice for whoever builds the deployment.
  - A CSV export holds one pooled connection for its whole duration (plan "Future issues").
  - Live mode can miss a trade when more than 20 feed events (the feed's length) arrive while the reload is in flight. Refresh fills it.
  - No link from the quote dialog to the symbol's history; small and useful, not in the plan.
- Defects noticed outside the scope, not fixed:
  - `apps/frontend/tsconfig.app.tsbuildinfo`, a build output, is tracked in git and changes with every build.
  - Still open from earlier notes:
    - `Sparkline` clipping and colour disagreement
    - SSE shutdown wedging `tsx watch`; it now also has a Postgres pool to close, which `onClose` already does
    - "Connection lost" on a first load
    - no main landmark on the narrow feed tab, and the feed tab's `scrollable-region-focusable`
    - Dockerfiles missing workspace dependencies

### After phase 08 (2026-11-14)
- Decided by the owner:
  - An empty bucket is a flat bar at the previous close, volume 0, by default; `fill=gaps` leaves it out.
  - Without TimescaleDB the endpoint answers `501 NOT_IMPLEMENTED` (no plain-Postgres fallback).
  - The chart shows the latest 120 bars, which is also the server's default window.
- Choices the plan left open, made here:
  - Endpoint: `GET /quotes/:symbol/candles?interval=1m|5m|1h|1d&from=&to=&fill=previous|gaps`. `interval` is required. A missing `to` is now, and a future one is clamped.
  - `from` and `to` widen to whole buckets. A missing `from` gives the latest 120 buckets. More than 500 buckets gives `400`, with a message telling the client to choose a larger interval.
  - **Departure from the plan:** step 1 says the endpoint returns `OhlcvBar[]`. It returns `{ symbol, interval, fill, from, to, bars, lastTradeAt }`, echoing the window like M3's response. `lastTradeAt` (the newest trade the bars include) was added so the browser never counts a streamed trade twice after a refetch.
  - `OhlcvBar` is now a TypeBox schema in `packages/types`, with `end` (exclusive) and `complete` added. Sessions vary in length, so the client never computes a bucket end itself.
  - Buckets before a symbol's first trade are left out in both fill modes.
  - Daily buckets come from `sessionStartFor` / the new `sessionEndFor` in `packages/symbols` (a `width_bucket` over the session starts). Fixed widths use `time_bucket` with origin `'epoch'`, so the server and JavaScript agree on the edges.
  - Frontend:
    - route `/chart/:symbol?interval=…`, default `1m` (no param)
    - an interval change replaces the history entry; a symbol change pushes one (like History)
    - the dialog's "Open chart" link goes to `/chart/<symbol>`
  - Live bar (`hooks/useCandles.ts`):
    - the hook keeps its own buffer of this symbol's streamed trades, because the shared feed holds only about a second of events across 18 symbols
    - it refetches the newest bars 1.5 s after the open bucket's end, retrying every 5 s on failure, and the last two bars when the stream comes back after a drop
    - only trades newer than `lastTradeAt` are added on top of the server's bars
    - a server bar with volume 0 (a filled bucket) takes all four prices from its first trade, as the server would
  - Chart keyboard: the chart is one tab stop. Left/Right/Home/End move the crosshair, and Escape goes back to following the latest bar. A polite live region reads the selected bar only after a key press, never on ticks.
- The History page's symbol picker and pills are now shared: `components/SymbolPicker`, `components/PillGroup`, and `components/pageStyles.ts` (`focusRing`, `buttonClass`, `panelClass`).
- Verified against the running stack (Postgres 15 with TimescaleDB 2.28):
  - With curl:
    - all four intervals, `aapl` and `BRK.B`
    - `400` for: a missing or unknown interval, `1ABC`, `from` after `to`, a full day of `1m` (more than 500 bars), `1d` from 2024, `fill=zero`
    - `404` for `ZZZZ`; 500 `1m` bars exactly gives `200`; a future `to` is clamped
  - Against SQL that does not use the Timescale functions (`array_agg … ORDER BY time`), OHLC and volume matched exactly for: one `1h`, `5m` and `1d` bucket each, and the closed `1m` bars below. Today's `1d` bar equals the day values in Redis (open, high, low, volume).
  - `501` against a scratch database with the extension dropped (it is preinstalled in `template1` of the Timescale image), for `1m` and `1d`.
  - In headless Chromium (Playwright, axe-core 4.11, reduced motion):
    - the open `1m` bar moves with the stream, and after its bucket closes the refetched bar matches SQL (MSFT, BRK.B)
    - the `1d` bar equals the dashboard's day values while it ticks
    - SSE service killed for 20 s mid-bucket, then restarted:
      - the bar open during the outage matched SQL after it closed (`1m`)
      - on `1h`, with no bucket close involved, the reconnect refetch fired and the open bar's volume equalled SQL
    - Chrome's offline mode does not cut an open streaming fetch, so that test only exercised the 5 s retry
    - no horizontal scroll and axe clean at 360×740, 768×1024, 1440×900 and 740×360 for `1m` and `1d`; axe also clean on the dialog and History
    - keyboard crosshair and its announcement, pointer crosshair, "Open chart" from the dialog and Back to the open dialog, nav `aria-current`
    - `/chart` without a symbol, `/chart/ZZZZ`, an unknown `?interval=`
    - mocked `500` with Retry, `501`, an empty series, and an all-flat series (axis 99.60–100.40, flat bodies drawn as lines, no NaN)
  - Latency on this data (88k rows): 8–35 ms. No load test; continuous aggregates (phase 19) are the plan's answer to slow queries.
- Not checked: a real phone, including the crosshair by touch (it uses pointer events, so it should work, but untested), a screen reader, Safari/Firefox, a real midnight rollover of the `1d` bar, the Dockerfiles (none changed).
- Left open, small:
  - At 360px the 120 candles are about 2 px wide. Pan and zoom are the plan's later step.
  - A symbol with no bars at all (no trade ever) gets no live bar from its first streamed trade, because there are no bucket edges to put it in. It appears on the next refetch or a reload.
  - The flat bars of a long quiet stretch look like a dotted line close to the dashed last-price line.
  - Background refetches have no `401` handling yet (phase 10 brief).
- Defects noticed outside the scope, not fixed:
  - A SIGKILLed SSE service is not restarted by `tsx watch` even after a real file change ("Process hasn't exited. Killing process..."), and killing that watcher stops the whole `pnpm dev:all`. Same root as the phase 03 shutdown note.
  - The random walk moved AAPL from about $231 to $258 in 8 minutes (phase 06's mean-reversion note), which makes every chart look like a spike.
  - Still open from earlier notes: the `Sparkline` defects, "Connection lost" on a first load, no main landmark on the narrow feed tab and its `scrollable-region-focusable`, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git.

### After phase 09 (2026-11-16)
- Done as planned:
  - `ForbiddenError` (`403`, `FORBIDDEN`) in `packages/errors`.
  - `GET`, `PATCH`, `DELETE /users/:id` check `request.authUserId === :id` before any lookup, so another user's id gives `403` whether it exists or not (no user enumeration).
  - `GET /users/me` added; `GET /users`, `UserService.list` and `UserRepository.findAll` removed.
  - A missing account behind a valid token is `401` ("Account no longer exists"), not `404`.
  - `POST /users/verify-credentials` needs `X-Internal-Token`. It is compared through sha256 digests with `timingSafeEqual` and never logged.
  - Changing email or password needs `currentPassword`.
  - Refresh tokens are indexed per user in a Redis set `auth:user-sessions:<userId>` (hashes only, TTL of the newest token). `save` writes the token and the index in one `MULTI`; `consume` and logout remove the entry.
- Choices the plan left open, made here:
  - `INTERNAL_API_TOKEN` (at least 32 characters, no default) in both services; a missing one stops the service at startup. `scripts/dev.sh` generates it into `.env.local` like `JWT_PRIVATE_KEY`; the example file only documents it.
  - A wrong internal token gets `401` with its own code `INTERNAL_AUTH_FAILED`. The auth service turns it into `502 USER_SERVICE_ERROR`, so a misconfiguration never looks like "Invalid email or password".
  - A wrong current password is `403`, not `401`: the session is valid, and the phase 10 client must not refresh or log out on a typo. A missing one is `400`.
  - Revocation is an auth service endpoint, `POST /internal/users/:id/sessions/revoke` (`204`), guarded by the same internal token. It sits outside `/auth/` because the reverse proxy (Q9) will forward `/auth/*` to browsers; `/internal/*` must never be routed there.
  - The user service revokes **before** it writes, for delete and for an email or password change. If the auth service is down the request fails with `503 AUTH_SERVICE_UNAVAILABLE` and nothing has changed. The cost: a revoke followed by a failed write (for example `409` on a taken email) has logged the user out for nothing. The caller's own session is revoked too (see the phase 11 brief).
  - The internal guard is duplicated in both apps for now (phase 10 brief).
- Verified with curl against the built services (Postgres and Redis from compose), 32 checks in one script plus the failure paths:
  - A's token on B: `GET`, `PATCH`, `DELETE` all `403`; an unknown uuid `403`; `GET /users` `404`; `/users/me` without a token `401`.
  - `verify-credentials` without and with a wrong header `401 INTERNAL_AUTH_FAILED`, with the right one `200`; login through the auth service works.
  - Name-only `PATCH` without a password `200`; only `currentPassword` `400`; password without `currentPassword` `400`; wrong one `403` with the session index untouched; right one `200`, after which the old refresh token is `401`, the index is gone and the old password no longer logs in.
  - Refresh keeps exactly one index entry; logout removes it.
  - Delete `204`, then the still-unexpired access token on `/users/me` `401` and the refresh token `401`.
  - Auth service stopped: delete and password change both `503`, account and old password unchanged.
  - Auth started with a different secret: login `502 USER_SERVICE_ERROR`. Empty secret: startup fails on `INTERNAL_API_TOKEN`.
  - The secret does not appear in either service's log.
- Not checked: the email-change path end to end (it shares the password branch), `scripts/dev.sh` from a fresh clone (the generation block was run by hand against the existing `.env.local`), the Dockerfiles and `infra/` (no manifest sets the auth env today).
- Left open, small:
  - `revokeAllForUser` is `SMEMBERS` then `DEL`, not atomic: a login landing between the two keeps a valid refresh token. A Lua script would close it.
  - Between the revoke and the write a refresh can still issue a token with the old summary for a moment; it is only a narrow window, but the same Lua script or a per-user "revoked before" timestamp would fix it.
  - Hashes of expired tokens stay in the index until the set's own TTL; harmless.
  - `DELETE /users/:id` does not ask for the password; A4 confirms by typing the email.
- Defects noticed outside the scope, not fixed:
  - `/auth/login` and `POST /users` have no rate limit yet (A3 step 9).

### Phase 10, part 1: A2 (2026-11-16)
- Decided by the owner during the session: phase 10 is reviewed in two steps on one branch and one pull request. A2 first (this entry), then A3 is added to the same branch and reviewed again before the merge. The pull request stays a draft until A3 is in: with A2 alone every market endpoint needs a token and nothing in the UI can get one.
- Decided by the owner: the line between the two steps. A2 includes the client's API module with the in-memory token and the single-flight refresh on `401` (A2 step 6 needs it). A3 adds the cookie, the auth context and pages, the route guard, logout, the Web Locks / `BroadcastChannel` coordination, the proactive refresh and the rate limits.
- Done in A2:
  - `packages/auth-guard` exports `createJwtGuard` and `createInternalGuard` (with `INTERNAL_TOKEN_HEADER`). Both copies of the internal guard and the user service's JWT guard are gone; `apps/user` no longer depends on `jose`.
  - The JWT guard has 30 s clock tolerance and requires `sub` and `exp`. It sets `request.authExpiresAt` (epoch ms) next to `authUserId`.
  - SSE service: `/quotes/*` (snapshot, discovery, ticks, ticks.csv, candles) and `/stream` sit in one Fastify scope with the guard as a `preHandler`; `/health/*` stays open. New config `AUTH_SERVICE_URL`, `JWT_ISSUER`, `JWT_AUDIENCE` with the same defaults as the user service.
  - A stream is ended at the token's `exp` with `event: session-expired` and `data:` (empty). A stream opened with a token that is past `exp` but inside the 30 s tolerance gets its snapshot and then `session-expired` at once.
  - Frontend: Vitest (`pnpm --filter @stock-platform/frontend test`). `stream/eventStream.ts` is the parser (bytes in, `{ type, data, lastEventId }` out; `lastEventId` is already tracked for S1's resume). `auth/session.ts` holds the token and `renew(rejectedToken)`: if the current token differs from the rejected one it is reused, otherwise one shared refresh runs. `api/client.ts` is the API client; `api/index.ts` creates the app's single `session` and `apiFetch`.
  - Every caller goes through `apiFetch`: the symbol list, tick history, candles (a `LoggedOutError` from a background refetch is not retried) and the CSV export, now a blob download that shows the server's `400` message.
  - `usePriceStream` reads `/stream` with `fetch`. Logged out: stop, status "Disconnected", no retry. `503`, network errors, `AuthUnavailableError` and a body that ends without `session-expired`: backoff as before. `session-expired`: renew and reconnect at once, with the status left at "Live". `session.onLoggedOut` aborts the stream at once.
  - Vite proxies `/auth` → 3005 and `/users` → 3004 (overridable with `VITE_AUTH_URL` / `VITE_USER_URL`, like `VITE_SSE_URL`).
- For A3:
  - The client already calls `POST /auth/refresh` with an empty JSON body, `credentials: "same-origin"` and `X-Requested-With: fetch`. Today the server rejects that body with `400` (it wants `refreshToken`), which the client counts as logged out: any `4xx` from refresh means "no session", a `5xx` or network error means "unavailable" and keeps the session. A3 makes the server read the cookie.
  - `session.setAccessToken` is how login puts the token in; `session.onLoggedOut` is where the auth context hears about a logout; `session.logOut()` is what the logout button should call after `/auth/logout`. The cross-tab lock and broadcast belong around `refreshFromServer` in `api/index.ts`, so `renew` stays single-flight within the tab and the lock makes it hold across tabs.
  - A `401` from the symbol list now shows the list's error state ("Could not load the list of symbols") and "Disconnected"; the route guard will redirect before that matters.
  - `renew` does not remember being logged out: after a logout, the next `401` tries one more refresh. Fine for A3, since the route guard stops requests once logged out.
- Verified against `pnpm dev:all`:
  - With curl: all five `/quotes/*` routes and `/stream` give `401` without a token and with a garbage one, the rejected stream is a JSON `401` with no SSE header; `/health` `200`; with a token every route `200`, a bad symbol still `400`, and the stream sends `snapshot` and `price`.
  - Expiry: with a second auth instance issuing 20 s tokens (same key), the server sent `session-expired` and closed the stream in the second of `exp`. The same token kept working for one-shot requests until `exp` + 30 s, then `401`.
  - An SSE instance pointed at an unreachable auth service answers `503 JWKS_UNAVAILABLE`.
  - Unit tests: 12 parser tests (every byte split of a text, CRLF split across chunks, a split inside 2-, 3- and 4-byte characters, one byte at a time) and 10 client tests (parallel `401`s give one refresh; `403` and `503` never refresh; a second `401`, a refused refresh, an unavailable refresh).
  - Headless Chromium (Playwright 1.57) at 1440×900, with `/auth/refresh` answered in the browser by a real login, since there is no login page yet:
    - without a session: the list gets `401`, one refresh with `X-Requested-With: fetch`, and no `/stream` request
    - with a session: 18 cards, one `/stream` request with a bearer token, the feed fills, status "Live"; History loads, the export downloads `AAPL_<from>_<to>.csv` with the header and rows; a mocked `400` shows its message; the chart loads
    - a mocked `503` on `/stream`: 4 attempts in 5 s with backoff, "Reconnecting x4", no extra refresh
    - 20 s tokens: over 50 s the stream reconnected after each expiry (gaps of 19.5 s and 20.0 s), one refresh per reconnect, and the status was "Live" at every 200 ms sample with no "Connection lost" banner
- Not checked: parallel `401`s in the browser (at startup only the list request runs; covered by the unit test), other widths, the Dockerfile (`packages/auth-guard` added to the SSE service image, not built).
- Left open: key rotation (owner decision, out of scope).
- Defects noticed outside the scope, not fixed:
  - In `stream.routes.ts` the `close` listener is attached after `await getInitialQuotes`, so a client that disconnects during that await leaves its Redis subscription and the connection count behind. Older than this phase; S2 rewrites the subscription.
  - The API client retries a request by sending the same `init` again. That is fine for a string body, but a `ReadableStream` body cannot be sent twice. No caller sends one.
  - Still open from earlier notes: the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the narrow feed tab's landmark and `scrollable-region-focusable`, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git.

### Phase 10, part 2: A3 (2026-11-16)
- Decided by the owner during the session:
  - The shell has no top bar, so the name and "Log out" sit at the sidebar foot, above the connection status. Wide: the name above a labelled button. Icon rail: an icon button with "Log out <name>" as its tooltip. Narrow: a "Log out" text button at the end of the header row, with the name read out only.
  - A browser never gets the refresh token in a response body. Login with `X-Requested-With: fetch` gets the cookie and no `refreshToken` in the body; without the header it gets the body form and no cookie.
  - `TRUST_PROXY` (auth and user) is passed to Fastify's `trustProxy`. It is empty (off) by default; `.env.local.example` sets `loopback`. The Vite proxy sends `X-Forwarded-For` (`xfwd`) on `/auth` and `/users`. Production sets it to the reverse proxy's address (Q9).
  - Redis down: login and registration answer `503 RATE_LIMIT_UNAVAILABLE` (fail closed). The user service now needs `REDIS_URL`.
- Choices made here:
  - **Refinement of the body/cookie decision:** refresh and logout require `X-Requested-With` from every client, so there the header cannot pick the mode. The mode is where the token came from: a body token gets a body answer and no cookie, a cookie gets a cookie answer.
  - The cookie is `refresh_token` (`HttpOnly; SameSite=Strict; Path=/auth; Max-Age` = the refresh TTL), with `Secure` when `NODE_ENV=production` (checked). A refused cookie refresh clears it, logout clears it, and a browser login that arrives with an old cookie revokes that old session first.
  - Rate limits use `FixedWindowCounter` (`packages/redis`): `INCR` with `EXPIRE … NX` and `TTL` in one `MULTI`, which needs Redis 7. The keys are `ratelimit:login:ip:<ip>`, `ratelimit:login:email:<sha256 of the lower-cased email>` and `ratelimit:register:ip:<ip>`. `RateLimitedError` (`packages/errors`) carries `Retry-After`.
  - Only a `401` from `verify-credentials` counts as a failed login; a user-service outage does not. Blocked attempts still count against the IP. Registration counts in `onRequest`, so invalid bodies count too.
  - The redirect target travels as `/login?next=<path>`. It is validated by `auth/redirect.ts` and dropped after a chosen logout, so a logout lands on plain `/login`; a session that ended on its own keeps it.
  - If the startup refresh cannot reach the auth service, the splash says "Service unavailable, try again" with a Try again button, instead of showing the login page.
  - Proactive refresh fires 60 s before `expiresIn`. A token shorter than 2 minutes is refreshed at half its life, so a short test token cannot loop.
  - Tabs (`auth/tabSync.ts`): the tab that wins the lock posts its new token before releasing the lock. Logins are broadcast too, so a tab on the login page follows a login in another tab. Every logout in a tab is broadcast, a refused refresh included, since the cookie is shared.
  - `StreamProvider` moved from `main.tsx` into the route guard. The 404 page is behind the guard as well.
  - Messages:
    - "Invalid email or password"
    - "Service unavailable, try again" (`5xx` or a network error)
    - "Too many attempts, try again in N minutes" (from `Retry-After`)
    - a `409` shows the server's "A user with this email already exists"
    - a registration `400` shows the form's rules in one line
- Verified:
  - curl against the dev services, 41 checks:
    - cookie attributes, the body/cookie modes for login, refresh and logout, and `403` without the header
    - rotation; a reused cookie gets `401` and is cleared; logout; re-login revokes the old cookie
    - 5 failures then `429` from a new IP even with the right password; the upper-cased email shares the counter; an unknown email is blocked the same way; a success resets the count
    - 20 attempts per IP then `429`; 5 registrations then `429` (`Retry-After` near 3600); no plain email in any Redis key
  - Scratch instances: Redis unreachable gives `503 RATE_LIMIT_UNAVAILABLE` from both services (after about 10 s of ioredis retries); `NODE_ENV=production` adds `Secure`.
  - Unit tests, 49 in all, including:
    - the redirect validation: `//evil.com`, `https://…`, `/\evil.com`, `javascript:`, control characters, `/login` as a target, round trip through `next`
    - the tab sync: real Web Locks in Node 24, so a tab waiting on the lock uses the broadcast token and does not refresh; logout reaches the other tab without echoing back
    - the proactive delay
  - Headless Chromium (Playwright 1.57, axe-core 4.11) against `pnpm dev`, 60 checks:
    - guard and registration: logged out, `/history/AAPL?x=1` goes to `/login?next=…`, with only `/auth/refresh` sent and no market request; registering from there lands on that page; the login body has no refresh token; the cookie is `httpOnly`, `Strict`, on `/auth` and invisible to `document.cookie`
    - reload: the session survives and the login page never renders (MutationObserver from the first byte)
    - the dashboard goes Live with one `/stream`; logged in, `/login?next=//evil.com` goes to `/`
    - logout: it calls `/auth/logout`, clears the cookie and lands on `/login`, and a reload stays logged out
    - errors: a wrong password, mocked `503`, `429` and a network error give the right messages, and the `409` message shows
    - splash: no spinner before 300 ms, a static spinner under reduced motion, and a `503` on refresh shows the splash with Try again (never the login page)
    - `autocomplete` attributes; no horizontal scroll and axe clean on login and register at 360×740, 768×1024, 740×360 and 1440×900, and on the dashboard at 360, 1024 and 1440
  - Done when, with a second auth instance issuing 20 s tokens behind a second Vite:
    - two tabs over 70 s: 7 refreshes in all, one every 10 s, all from one tab (the other took the broadcast token)
    - both streams reconnected at each expiry, no `401` anywhere, "Live" in all 334 samples, no "Connection lost" banner
    - logging out in one tab sent the other to `/login` in 93 ms, and logging in one tab logged in the other
    - five rounds of reloading both tabs at the same moment: one refresh in four rounds, two in one, never a `401`
- Not checked:
  - the 600 s path of the proactive refresh in a browser (only unit-tested; the browser run used the half-life path of short tokens)
  - a real phone, Safari and Firefox, a screen reader, and a password manager actually offering to save
  - `scripts/dev.sh` from a fresh clone (it copies `TRUST_PROXY` from the example like any missing variable)
  - the production cookie behind a real reverse proxy (Q9 does not exist)
  - Dockerfiles: there is none for auth or user; the user service now needs `packages/redis`
- Left open:
  - Logging out while the auth service is down forgets the token in the tab, but the server never revoked the cookie, so a reload logs the user back in. JavaScript cannot clear an `httpOnly` cookie.
  - The per-email check and the failure count are separate steps, so parallel wrong passwords can exceed 5 by a few; the IP limit bounds it.
  - Without Redis, login and registration take about 10 s to answer `503`; a shorter `maxRetriesPerRequest` would shorten that.
  - Key rotation (owner decision); refresh-token reuse detection (A3 future issue).
- Defects noticed outside the scope, not fixed:
  - When `pnpm install` ran during `pnpm dev:all`, `tsx watch` restarted the user service mid-install and it stayed down until a source file changed. Same family as the earlier `tsx watch` notes.
  - Still open from earlier notes: the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the narrow feed tab's landmark and `scrollable-region-focusable`, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git, the `close` listener order in `stream.routes.ts`.

### After phase 11 (2026-11-16)
- Decided by the owner during the session:
  - After an email or password change the page logs in again with the new credentials (`useAuth().logIn`), as the brief suggested; no "keep this session" option on the revoke endpoint. Other browsers and devices are logged out; the other tabs of this browser follow the login broadcast.
  - The user service refuses a taken email (`409`) **before** it revokes, so a typo no longer ends every session. The unique index still decides a race; if that `409` comes after the revoke, the page logs in again with the unchanged email and the current password (it does so on every `409`; when nothing was revoked that login just replaces this browser's session).
  - **Departure from the plan, found in the code:** the auth service stores the user summary with each refresh token at login and returns that copy on every refresh, so a changed name never reached a refresh (a reload brought the old name back until the next login). The plan's "update it from the `PATCH` response rather than waiting for the next refresh" assumed the refresh would catch up. Fixed: a name-only change makes the user service call a new internal endpoint, `PUT /internal/users/:id/sessions/summary` (`{ email, name }`, internal token, `204`), which rewrites every stored summary of that user with `SET … KEEPTTL XX` (expiry kept, consumed tokens not brought back). It runs **before** the write, like the revoke: with the auth service unreachable or refusing, the rename fails (`503`/`502`) and nothing changed.
  - No Preferences section until D3 or D4 has a setting for it (phase 14 brief updated).
- Choices made here:
  - The session has `updateUser(user)` and `onUserUpdated`; `tabSync` carries it as a `{ type: "user" }` message. It is ignored when the tab has no user or a different one. `useAuth().updateUser` is how the page uses it.
  - `api/account.ts` (`updateAccount`, `deleteAccount`) maps `400`, `403` (wrong current password), `409` (email taken) and anything else (`5xx`, network, auth unavailable) to typed errors. A `LoggedOutError` is passed through to the guard.
  - Profile sends only the changed fields, with the name trimmed; the current-password field appears only when the email changed. Save is disabled with no change. A field the user has not edited follows a change from another tab.
  - Field rules mirror `apps/user/src/models/user.ts` in `pages/settings/validation.ts`, the email pattern being ajv-formats' "full" one that Fastify uses. Errors show on submit, under their field (`aria-invalid`, `aria-describedby`), and clear when the field is edited.
  - Delete: a Radix dialog asking for the email (case and surrounding spaces ignored); it cannot be closed while the request runs. The copy says there is no grace period and no data export (plan "Future issues").
  - Settings nav icon: three sliders (`SettingsIcon`).
- Verified:
  - curl against the dev services, 25 checks, plus a scratch user service:
    - a taken email `409` (also in another case) and the caller's refresh token still works afterwards; a taken email with a wrong password `403`
    - a rename returns the new name from the next refresh of both of the user's sessions, with the TTL unchanged and a consumed token not recreated
    - an email change still ends every session; the user's own email in another case is not a conflict
    - the internal endpoint: `401` without the token, `400` for a bad body or id, `204` for a user without sessions
    - a scratch user service with a wrong internal token: a rename gives `502` and the name is unchanged
  - Unit tests: 54 in all, new ones for the user update across tabs (shown, token kept, unchanged or other-account details ignored, a logged-out tab not signed in) and for the field rules.
  - Headless Chromium (Playwright 1.64, axe-core 4.11, reduced motion) against `pnpm dev:all`, 61 checks, two tabs of one context plus a second context as "another device":
    - Settings nav link current at 1440 and in the narrow tab bar; no Preferences section; Save disabled with no change
    - a blank name and a malformed email show their errors and send nothing; a double-click sends one `PATCH`
    - rename: both tabs show the new name at once and after a reload; the other device keeps its session and gets the new name on reload
    - email: missing and wrong current password on its field, `409` on the email field, the other device still logged in after the `409`; a mocked `503` shows "Service unavailable, try again"; a real change keeps both tabs logged in with the new email and logs the other device out
    - password: short and mismatched errors, wrong current password on its field, success clears the fields, both tabs stay in, the other device is out, the old password no longer logs in
    - delete: focus starts in the confirmation field, Escape returns focus to the trigger, Delete stays disabled until the email is typed, a double-click sends one `DELETE`, both tabs land on `/login`, a reload stays logged out, the account cannot log in
    - no horizontal scroll at 360×740, 768×1024, 740×360 and 1440×900; axe clean on the page at 360, 768 and 1440 and on the dialog at 360 and 1440
    - the stream stays on one connection and "Live" through an email change
  - Screenshots at 1440, 768 and 360 and of the dialog were looked at.
- Not checked: the `409`-after-revoke race and its re-login (needs two writes at the same moment), a password manager actually offering to save the new password, a real phone, Safari and Firefox, a screen reader.
- Left open:
  - Account deletion leaves the user's portfolio data (phase 15 brief).
  - The summary rewrite is not atomic with a concurrent login, like the revoke: a login between the rewrite and the database write stores the old name until its next login.
  - A rename's summary call happens before the write, so a failed write (rare: a database error) leaves the sessions with a name that was not saved, until the next login.
  - If the re-login after a credential change fails (rate limit, outage), the page says so and the session ends at the next refresh.
- Defects noticed outside the scope, not fixed:
  - `apps/user/src/repositories/user.repository.ts` still has an `as` cast in `rethrowUniqueViolation` (`(err as { code?: string }).code`), against the owner's no-casts rule from phase 05.
  - Still open from earlier notes: the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the narrow feed tab's landmark and `scrollable-region-focusable`, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git, the `close` listener order in `stream.routes.ts`.

### After phase 12 (2026-11-18)
- Done as one commit per session on `master` (31 commits, `PHASE-12-COMMITS.md`), not on `feature/phase-12-keycloak`. The detail of each commit is in that file's "Notes between commits"; the decisions are in ADR-002 (`docs/adr/ADR-002-keycloak-and-bff.md`).
- Decided by the owner during the phase: one "Name" field (`firstName`); no password reset (no SMTP); the BFF on 3007 until `apps/auth` went, then 3005; the phase 10 pages as the theme's design; the theme JAR built with a local JDK and Maven; Google provider disabled and its button hidden without credentials, the button above the form with an "or" divider; Q13 confirmed as a token handler; the Redis session value encrypted with AES-256-GCM.
- What exists: `apps/bff` (`/bff/login`, `/bff/callback`, `/bff/me`, `/bff/logout`, `/bff/backchannel-logout`, and `/quotes/*` and `/stream` proxied with the bearer token), `apps/keycloak-theme` (Keycloakify), `packages/design-tokens`, the realm and compose service under `infra/keycloak`, and the auth guard accepting RS256 with `JWKS_URL`. `apps/auth`, `apps/user`, the frontend's token code and the `users` table are gone.
- Verified: `pnpm build`; BFF (66) and frontend (38) Vitest suites; the BFF and SSE service against the compose Keycloak and Redis (`/bff/me`, `/quotes/AAPL/snapshot` and `/stream` without a cookie are `401`, a non-read without `X-Requested-With` is `403`, the login redirect, a bad logout token is `400`, the docs server's proxy). Earlier commits ran a registration, the stream with a Keycloak RS256 token, a reload, logout across two tabs, a 40 s access-token lifespan with the stream reconnecting, and back-channel logout from the admin console. Settings actions were run with curl.
- **Not run:**
  - The theme JAR inside Keycloak: Maven is not installed here, so the login pages shown were Keycloak's default theme. The open checks (field order on register, lockout message, error texts, axe, the Google button on the register page, the four viewport sizes) wait for that.
  - Google sign-in, in full (no credentials), including `google-name` and linking an existing password account.
  - `scripts/dev.sh` end to end (it stops at the Maven check), and the realm reset it does: the running Keycloak still has the old back-channel URL (3007); run `scripts/dev.sh --reset-realm`.
  - A browser pass of the whole "Done when" in one go, `UPDATE_PASSWORD`, cancelling an action, Firefox with strict tracking protection, the `__Host-session` cookie in production, and a back-channel logout reaching an open tab.
- Left open:
  - After `delete_account` Keycloak shows its own info page and does not send the browser back; the BFF session lasts until its access token expires (up to 10 minutes). Fix with a themed `info.ftl` and/or phase 15's K6 listener.
  - The refresh is single-flight per process; Keycloak's refresh-token rotation must stay off until a Redis lock replaces the in-process map.
  - `docs/openapi.yaml` lists only the SSE service's routes behind the BFF; add `/portfolio/*` when phase 15 adds it.
  - The BFF and SSE service do not run in compose yet; Keycloak reaches the BFF at `host.docker.internal:3005` for back-channel logout.
- For later phases: `user_id` is the Keycloak `sub` (a UUID). The frontend's data calls are plain `fetch` with the cookie. New services the browser calls need a route in `apps/bff/src/routes/proxy.routes.ts`, and the Vite proxy and the docs server already send `/bff` there.

### Roadmap change: Keycloak (2026-11-16)
- Decided by the owner, outside a phase session: replace the hand-written auth from phases 09–11 with Keycloak, Keycloakify pages in the app's design and Google sign-in, with the tokens kept by a backend-for-frontend (`apps/bff`). New plan file `08-identity.md` (K1–K6) and decisions Q10–Q13 in `README.md`. A first version with `keycloak-js` tokens in the page was replaced the same day by the BFF. K6 (account events) is part of phase 15.
- Inserted as phase 12. The old phases 12–18 are now 13–19, and every phase reference in this file was renumbered, including those in the notes above. Branches and pull requests of done phases keep their old names. Phases 15 and 18 now need 12 instead of 10.
- Briefs updated for it: 14 (Settings sections), 15 (no `apps/user` to copy, proxy through the BFF, K6), 18 (stream through the BFF).
- What the phase 09–11 notes describe in `apps/auth` and `apps/user` (cookie modes, rate limits, the internal token, session summaries) is history once phase 12 is merged. Their open items about those services (non-atomic revoke, the `as` cast in `user.repository.ts`) go with the code.

### After phase 13 (2026-11-25)
- Decided by the owner during the session:
  - Live re-sorting: both remedies. The order changes at most every 5 s, and not at all while the pointer is over the grid or focus is inside it. A change of filter, search, sort or of the set of symbols re-orders at once. Values keep updating while the order is held.
  - Sort: keys symbol, price, day % (`changePercent`) and volume, each in both directions (8 options in the select). URL `?sort=price-desc`, no param for symbol A–Z; search is `?q=`. The table's Symbol, Last, Day % and Volume headers sort; Name, Day chg, High, Low and Trend do not.
  - Times: the user's locale with a 24-hour clock, like History and Chart (`formatClockTime` in `utils/format.ts`); numbers stay en-US.
  - Feed filter: "Open quote" follows the dialog's `?symbol=` on the quotes page, and shows every symbol (with a caption) while none is open. The filter is component state, not in the URL, and survives navigation (the feed lives in `AppShell`).
  - **Departure from the plan (D3 step 6):** below 768 px the table also hides Day chg ($) and Trend, not only name, high and low. Six columns needed about 410 px against 328 at 360 px. Phones show Symbol, Last, Day %, Volume.
- Choices made here:
  - Search matches a symbol prefix or a name substring (case-insensitive, trimmed). The order is always the sort's; symbol-prefix matches are not ranked first, since step 3 sorts after searching. "ms" finds MSFT and META ("Meta Platfor**ms**"). The matcher is `matchesQuery` in `utils/quoteView.ts`, isolated for fuzzy matching later.
  - Values a symbol does not have yet (`null`) sort last in both directions; ties go to the symbol A–Z.
  - The search box keeps what was typed (spaces included) and writes the trimmed query to the URL with `replace`. React Router runs navigations as transitions, so the box holds its own text and takes the URL's value only when it changes from elsewhere (Clear).
  - "No symbols match ‘xyz’" with a "Clear search" button, which also focuses the box. The Topbar's "Active symbols" counts what is shown.
  - Feed: the hook keeps the newest 2,000 trades (`FEED_BUFFER_LIMIT` in `usePriceStream.ts`, about two minutes at 18 symbols), the component shows 100 (`FEED_ROW_LIMIT`). The hook's buffer is only a memory bound: a one-symbol filter still finds its 100 rows only if they are in it. A pause keeps a reference to the feed as it was (no copy) and counts newer trades that match the filter, up to "500+"; if the paused-at trade has left the buffer, the count shows "N+". Resume shows the newest rows in arrival order. That is the stream's order: out-of-order ticks never enter the stream (phase 06), so it is time order per symbol.
  - The feed pauses while the pointer is over the list **or focus is in it**. The list is a focusable `<ol>` (`tabIndex=0`), which fixes the `scrollable-region-focusable` defect from the phase 05 notes. Buy/sell badges carry a hidden "buy"/"sell" (phase 04 note). Rows have `type: "trade"` (`FeedEvent`).
  - Table: a real `<table>` with a sticky header (offset by `main`'s padding, since a sticky element stops at the scroller's padding edge). Sortable headers are buttons inside `th` with `aria-sort` on the sorted one. Each row's symbol is a button with `data-symbol`, so a row is one tab stop and the dialog's focus return works unchanged. A click anywhere on the row focuses that button and opens the dialog. Rows are `memo` on their stock, which keeps its identity between ticks of other symbols. The price cell flashes its background only (`animate-flash-bg-up/down`, new keyframes in `global.css`), with `tabular-nums`. Volume is compact ("170.5K") below 768 px with the full number as `title`. "Delayed" shows beside the symbol.
  - The cards/table toggle is a Radix toggle group with the sector pills' style, beside Search and Sort.
- Verified against `pnpm dev` (scripts/dev.sh stops at the Maven check, see phase 12) with the compose infra, logged in through `/bff/login` as a throwaway Keycloak user (deleted afterwards). Headless Chromium (Playwright 1.64, axe-core 4.11, reduced motion unless stated):
  - D1 (30 checks): "ms" shows Microsoft and sets `?q=ms`; price high to low orders all 18 correctly; a reload keeps the box, the select and the result; "  BRK.B  " finds BRK.B and the URL has it trimmed; "xyz" shows the message and Clear restores 18, empties and focuses the box and drops `q`; `?sector=financials&q=b&sort=symbol-desc` gives BRK.B, BAC and the Topbar counts 2; `?q=xyz&symbol=AAPL` opens AAPL's dialog and closing it keeps `q`. Re-sorting by day change with the pointer away happened 3 times in 16 s, gaps 4.9–5.1 s; none in 12 s with the pointer on a card, and prices kept moving meanwhile. No horizontal scroll and axe clean at 360, 768 and 1440.
  - D2: rows "289 @ $196.55" with a 24-hour time, 100 rows; Pause freezes the list and counted 58 in 3 s; Resume shows newer rows and clears the badge; the pointer over the list and focus in it pause and leaving resumes; TSLA shows only TSLA and a 5 s pause counted 5; "Open quote" shows the caption with no dialog, only AAPL with AAPL's dialog open (opened from its card) and every symbol after closing; no row animation under reduced motion; a 31 s pause shows "500+ new" with the frozen rows kept; with `/stream` blocked, "Waiting for trades…" and "No trades for TSLA yet". No horizontal scroll at 360, 768 (drawer) and 1440; axe clean at 768 and 1440.
  - D3: cards by default at 1440, table at 360, a stored "cards" wins on a phone; the toggle keeps the URL and the same rows in the same order, and the choice survives a reload; header clicks set `?sort=` and the select (Last: high to low, then low to high), the select's choice shows as `aria-sort` on its header, Symbol returns to no param, exactly one `aria-sort`; Enter on a row opens it, Escape returns focus to the row, Tab goes to the next row, a click on a cell opens the row and Close returns focus to it; the header sticks flush at 1440×600 and 360×740; without reduced motion the price cell flashed with constant width and text colour over 3 s; with `localStorage` throwing, cards by default, the toggle works, no page error. No horizontal scroll of the page or of `main`, and axe clean, at 360×740, 740×360, 768×1024, 1280×800 and 1440×900.
  - Unit tests: `utils/quoteView.test.ts` (sort parsing, matching, null ordering, ties); the frontend suite passes (47 tests). `pnpm build` passes.
  - Screenshots at 360, 768 and 1440 were looked at.
- Not checked: a real phone, Safari and Firefox, a screen reader (the table's `aria-sort` and caption, the feed list), the "Delayed" marker and the greyscale stale state in the table (same props and classes as the cards; the ingestor and SSE service were not stopped), the row re-render count in React's profiler.
- Left open:
  - The 360 px feed tab still fails axe `landmark-one-main` and `page-has-heading-one` (`main` is hidden while the feed tab shows; phase 04 note).
  - `useCandles` and `HistoryPage`'s live mode read every feed row as a trade. When P2 or P3 add other row `type`s, they must filter on `type === "trade"`.
  - History's live mode could miss trades when more than 20 feed events arrived during a reload (phase 07 note); the feed now keeps 2,000, which should end that, not re-tested.
- Defects noticed outside the scope, not fixed:
  - Still open from earlier notes: the `Sparkline` defects (clipping, colour versus day change; now also in the table), SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git (it changed with every build here and was left out of the commits), the `close` listener order in `stream.routes.ts`. The random walk's drift (phase 06) gave day changes of ±40–55% within the session, which makes sort-by-change look odd.

### After phase 14 (2026-11-25)
- Decided by the owner during the session: the sidebar's theme control is a menu button (one icon button showing the current choice, opening a menu of System, Light, Dark). Icon only in the phone header row and on the rail, "Theme: System" beside the icon on the wide sidebar. It uses `@radix-ui/react-dropdown-menu` (added).
- D4, choices made here:
  - The light theme is `:root[data-theme="light"]` in `packages/design-tokens/src/tokens.css`; the dark values stay on `:root` and both set `color-scheme`. The frontend always sets `data-theme` (`light` or `dark`); the Keycloak theme never does, so its pages stay dark. Making the login pages follow the choice would need the attribute set there too (the choice is in the app's `localStorage`, same origin through the Vite proxy); not done.
  - Light values: brand `#4a5700` (dark olive) for text, borders, the focus ring and dots, with lime kept only in `--accent-brand-dim` (45% lime tint); `--positive` `#0d6b31`, `--negative` `#b3192a`, `--warning` `#8f4800`, `--text-secondary` `#525c70`, `--text-inverse` white (on the solid buy/sell badges and the chart's price tag). Each was computed against the lowest-contrast surface it sits on, tints composited (badge text on its own 15% tint over `--bg-sidebar` is at least 4.51:1), and then checked with axe.
  - New token `--sparkline-fill-opacity` (0.08 dark, 0.14 light), used as the class `opacity-(--sparkline-fill-opacity)`. The chart's volume bars (45%) and last-price line (70%) kept fixed opacities: they read well in both themes.
  - The choice is `localStorage` `streamtick.theme` (`light`/`dark`; "System" removes the key). `src/theme/theme.ts` has the rules, `ThemeProvider` (above the router in `main.tsx`) applies them, follows the system preference while the choice is "System", and follows a choice made in another tab (`storage` event). The inline script in `index.html` repeats the key, values and `theme-color` colours; change both together.
  - `<meta name="theme-color">` is `--bg-base` of the theme in use.
  - The favicon is unchanged: it is a dark tile with teal and lime marks, so it shows on light and dark browser chrome alike.
  - The theme menu is `modal={false}` and not portalled. A modal Radix menu sets `aria-hidden` on the rest of the page (axe `aria-hidden-focus`), and a portal puts it outside every landmark (axe `region`). It still closes on Escape, Tab and an outside click.
  - Settings has a Preferences section between Password and Danger zone: Theme (System, Light, Dark), Quotes view (Automatic, Cards, Table) and Single-key shortcuts (On, Off), plus "Show keyboard shortcuts". "Automatic" removes `streamtick.quotes.view`.
- D5, choices made here:
  - One `keydown` listener on `window` in `shortcuts/ShortcutsProvider.tsx`, inside `AppShell`. The map is `SHORTCUTS` in `shortcuts/shortcuts.ts`, with the pure `matchKey` and `neighbourIndex` (unit-tested). The help dialog is generated from the map.
  - Ignored: typing in text inputs, text areas, selects and editable content; anything with Ctrl, Alt or Meta; key repeat; IME composition; and everything while a Radix dialog or menu is in the DOM (`[role=dialog|alertdialog|menu]`), which handles its own Escape. Keys match `event.key`, so they are case-sensitive (Shift+P does nothing).
  - `/` and `v` act only on the quotes page (it registers them with `useQuotesShortcuts` while mounted); `p`, `g …` and `?` work everywhere in the shell. `g` waits one second; a key that does not complete the sequence is matched on its own, so a stray `g` swallows nothing.
  - Esc in the search box empties it (handled by `QuoteSearch`, because Firefox does not do it for `type="search"`); Esc elsewhere on the quotes page clears the search. Enter on a card or row is the button's own behaviour and is listed in the help only.
  - Arrows move between `main button[data-symbol]` by on-screen position (table rows use their `tr` box), so any column count works. Left and right stay in the row. Up and down go to the nearest row and the closest item in it. There is no wrap at the edges. Arrows, Enter and Esc ignore the off switch, which only covers character keys (WCAG 2.1.4). The off switch is `localStorage` `streamtick.shortcuts=off`.
  - `p` and `v` are announced in a polite `role="status"` region ("Live feed paused", "Table view"), since the feed may be off screen.
  - The help dialog returns focus to whatever had it before (it has no Radix trigger). It is `z-40`, above the sticky table header (`z-10`) and the drawer (`z-30`).
  - **Lifted state:** the feed's Pause flag and the quotes view now live in `AppShell/ShellControls.tsx` (`useShellControls()`), shared by the feed, the quotes page, the shortcuts and Settings. `useQuoteView()` is gone; `useQuoteViewState()` is called only by that provider. **Small change to D3:** with no stored view ("Automatic") the view now follows the width live (`useSyncExternalStore` on the 768px query) rather than being fixed when the page was opened.
- Verified against `pnpm dev` with the compose infra, logged in through `/bff/login` as a throwaway user. The user was registered on the app's sign-up page and deleted afterwards through Settings → Delete account (a fresh login is refused). Headless Chromium (Playwright 1.64, axe-core 4.11, reduced motion), two scripts, all passing on the final commit:
  - D4 (50 checks): system light gives light with `theme-color` `#f3f4f7`. An emulated system change while the page is open is followed both ways. Menu → Dark stores `dark` and ignores a light system. The menu works from the keyboard and focus returns to its button. With the system dark and Light chosen, `data-theme="light"` is already set when `<body>` is parsed on reload (no flash). There are no dark patches (a scan for large dark backgrounds) on quotes, chart, history, settings and the 404 page. axe is clean in light on those pages, the dialog, the table, the open menu at 360×740, 768×1024 and 740×360, and in dark at 1440. The menu stays inside the viewport at those sizes, with no horizontal scroll. Settings: Theme, System removing the key, Quotes view writing and removing its key; a second tab follows a theme change. With `localStorage` throwing: the system theme, the menu still switches, no page error.
  - D5 (58 checks), keyboard only: `/` focuses search, and typing `p` there does not pause. Esc in the box and outside it clears the search. Ctrl+/ is left alone. → and ↓ across the card grid, with edges staying put. Enter opens, `p`/`?`/`g s` do nothing in the dialog, Esc closes and focus returns to the card. `v` gives the table, ↓↓ walks rows, → stays, Enter opens the row and focus returns to it. `p` pauses and resumes, with the announcement. `g c/h/s/q` navigate, and `g` then `c` after 1.3 s does nothing. `/` and `v` do nothing on the chart page; `p` works there. `?` lists all 11 entries. With shortcuts off, `g q`, `?` and `p` do nothing but arrows still work, and the Settings button opens the help marked "(off)", with focus returning to it. The Settings view choice reaches the quotes page. At 360, `g c` from the feed tab shows the chart page. axe is clean on the help dialog at 360 light, 768 dark and 1440 light, and on Settings.
  - Unit tests: 10 new ones in `shortcuts/shortcuts.test.ts`; the frontend suite passes (57). `pnpm build` passes.
  - Screenshots in light at 1440 (quotes, chart, dialog, settings) and 360 (menu, help sheet) were looked at.
- Not checked: Firefox and Safari (only Chromium is installed here, so the Firefox Escape fix in the search box is untested there), a real phone, a screen reader (menu, help dialog, the announcements), the Keycloak pages (still dark, and the theme JAR is still not built), and the light theme's stale greyscale and "Delayed" states (the ingestor was not stopped).
- Left open:
  - `/` on a page other than quotes does nothing; it could go to the quotes page and focus the search.
  - Trading shortcuts for P3 must not go into `SHORTCUTS` as single keys without a confirmation step (plan, "Future issues").
- For later phases: every new component needs a look in both themes. Use tokens only, and no `rgba(`/hex in components. A control that changes the view or the feed's pause goes through `useShellControls()`.
- Defects noticed outside the scope, not fixed:
  - **The quote dialog (`DetailPanel`) has no z-index**, so at 360px in table view the sticky table header (`z-10`) draws over the dialog sheet. The fix is `z-40` on its overlay and content, as the help dialog has (phase 13).
  - Still open from earlier notes: the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the 360 feed tab's `landmark-one-main`, Dockerfiles missing workspace dependencies, `tsconfig.app.tsbuildinfo` tracked in git (left out of the commits again), the `close` listener order in `stream.routes.ts`.

### After phase 15 (2026-11-25)
- Decided by the owner during the session:
  - P1: one list per user, no `watchlists` table (plan as written).
  - Reordering and the "manage view" are a **Watchlist section in Settings** (between Preferences and Danger zone): Move up, Move down and Remove buttons per symbol; a symbol that left the registry is greyed and marked "No longer listed".
  - K6 is built with a local JDK and Maven (`openjdk-21-jdk-headless`, `maven`; a runtime alone has no `javac`, and `dev.sh` now checks for it).
  - **Departure from the plan (K6 step 1):** Keycloak cannot reach the broker at `redpanda:9092`, because Redpanda advertised only `localhost:9092`. Redpanda now has two listeners: `localhost:9092` for apps on the host and `kafka:29092` for containers on `stock-net`. The listener uses `kafka:29092`.
  - The provider JARs (theme and listener) are copied by `dev.sh` into `infra/keycloak/providers/` (gitignored), which compose mounts at `/opt/keycloak/providers`. `THEME_JAR_SHA` became `PROVIDERS_SHA`.
- Groundwork, choices made here:
  - `apps/portfolio` follows `apps/sse-service`: config, `prepareSchema` at start-up, health (`/health/ready` checks Postgres and Redis), and every API route inside the guarded scope. `userIdOf(request)` takes the id from the token only and refuses a `sub` that is not a UUID (`401`), rather than letting Postgres fail on the cast. It registers Redis per the plan, although only P3 reads it.
  - The BFF's `proxyRoutes` is registered once per service with its `paths` (`/quotes/*`, `/stream` → SSE service; `/portfolio/*` → `PORTFOLIO_SERVICE_URL`, default `http://localhost:3006`). CSRF and the bearer handling are unchanged. The docs server and `docs/openapi.yaml` include the watchlist paths.
  - `packages/kafka`'s `ensureTopic` takes `configEntries` for a topic it creates.
- P1, choices made here:
  - API: `GET /portfolio/watchlist` → `{ items: [{ symbol, addedAt, listed }] }`; `PUT` and `DELETE /portfolio/watchlist/:symbol` and `PUT /portfolio/watchlist/order` answer `204`. Adding needs a registered symbol (`400` malformed, `404` unknown). Removing takes any well-formed symbol, so delisted ones can be removed. The cap is 100 (`409`), checked under a per-user advisory lock so two adds at once cannot pass it or share a position.
  - Reorder: a symbol not on the list or named twice is `400`. Watched symbols the request leaves out (added on another device meanwhile) keep their order after the named ones, so the result is always the whole list. Fastify's defaults apply as in the other services: a single string is coerced to a one-item array and unknown body fields are dropped, not refused.
  - Client: `watchlist/watchlistStore.ts` (unit-tested). A star changes at once and is rolled back with a notice when refused. Writes for one symbol never overlap: clicks made while one is on its way only change the wanted state. A reload that started before a write was confirmed is ignored. The list reloads on window focus and when the tab becomes visible. If a load fails, stars become read-only (`aria-disabled`, title), and a notice with Retry says so.
  - `WatchlistProvider` sits next to `StreamProvider` in `RequireAuth`. The notice is a polite `role="status"` inside `main` (a region outside the landmarks would fail axe).
  - Stars: on a card, a sibling button over the top-right corner (a button cannot contain one); in a table row, before the symbol (28px); in the dialog, beside Close. Each is a toggle with the fixed name "Watch AAPL" and `aria-pressed`, and it stops the click from opening the dialog. The dialog now puts first focus on Close explicitly, so Enter right after opening does not star.
  - The Watchlist pill sits after "All" in the sector pills' group and sets `?list=watchlist` (it replaces `?sector=`, and a sector replaces it). With nothing starred it shows "Star a symbol to add it here."
  - Under the default sort (symbol A–Z), starred symbols come first in the watchlist's order (`starredFirst` in `utils/quoteView.ts`). Other sorts ignore stars. The settled-order hold of phase 13 also covers a starring click, so the card does not jump from under the pointer.
- K6, choices made here:
  - The listener (`infra/keycloak/event-listener`, id `stock-kafka`) has `kafka-clients` 3.9.1 shaded and relocated (codecs excluded, `slf4j-api` from Keycloak). It publishes only after Keycloak's transaction commits, on a background thread with a 10 s delivery limit. The producer is created at the first event, so a broker that is down never stops Keycloak starting. The realm lists `jboss-logging` and `stock-kafka` and turns admin events on, without representations.
  - The portfolio service consumes `identity.events` (group `portfolio-identity`, from the beginning for a new group) and commits after deleting; messages it does not understand are logged and skipped. The topic has 3 partitions and 7 days' retention (`dev.sh` creates it with `rpk`, and the service would too). The consumer runs in the background, so the API starts without the broker. It reconnects every 30 s, including after a crash kafkajs does not restart from by itself.
  - The nightly cleanup runs at `CLEANUP_HOUR_UTC` (default 3) and on demand with `pnpm --filter @stock-platform/portfolio cleanup`. It checks every user before deleting anything, and any failed lookup aborts the run. A non-zero count is logged at `warn` with the user ids. Client `stock-portfolio` (secret `KC_PORTFOLIO_CLIENT_SECRET`, generated by `dev.sh`) has only `realm-management/view-users`. Without the secret the service warns and schedules nothing.
- Verified against `scripts/dev.sh` (it now runs end to end: the theme JAR and the listener are built and loaded in Keycloak) and `pnpm dev`:
  - API through the BFF with a real session (23 checks plus 4 for the cap, through Playwright's request context): `401` without a session or token, `403` without `X-Requested-With`, idempotent add and remove, add order, `404`/`400`, reorder including a partial one, duplicate and not-on-list `400`, 18 concurrent adds giving 18 unique rows, a second device seeing the same list, and the cap: `409` at 100 (97 delisted rows seeded in SQL), an existing symbol still `204` at the cap, room again after a removal.
  - Browser (headless Chromium, Playwright 1.64, axe-core 4.11, one script, every check passing on the final code): stars on cards, table rows and the dialog; the server agrees; starred first; other sorts ignore stars; the Watchlist pill and URL, a sector replacing it, a reload keeping it; a double-click; the empty state; dialog focus on Close and back to the card; another device after a focus event; a mocked `503` rolling back with the notice; everything failing making the stars read-only, and Retry recovering. Settings: keyboard moves with focus kept (and moved to the other arrow at the top), the order saved and shown first on the quotes page, a delisted symbol marked and removed, focus to the neighbouring Remove; stars kept after logout and login. axe is clean and there is no horizontal scroll at 360×740, 768×1024, 740×360 and 1440×900 (cards, table, settings), on the dialog and the notice, and in the light theme. Screenshots at 360 (table, settings), 1440 (light quotes and dialog) were looked at.
  - K6 (16 checks in a shell script plus 3 for the self-deletion in the browser): self-deletion through Settings → rows gone 1.4 s after Confirm, published as `self`. Admin deletion → rows gone in under 0.1 s. Redpanda stopped → Keycloak still deletes (0.9 s), the listener logs the failure at `ERROR` with the user id, the rows stay, and the cleanup run removes them. A replayed event and a malformed message change nothing, with no lag left. Keycloak stopped → the cleanup exits 1 and deletes nothing; with Keycloak back it removes the ghost user's rows and keeps live users' rows.
  - Unit tests: portfolio 12, BFF 67 (one new: two services' paths), frontend 70 (13 new: store and `starredFirst`), the listener's 4 (JUnit, run by the Maven build). `pnpm build` passes.
- Not checked: a real phone, Firefox and Safari, a screen reader (the star toggles, the notice, the Settings list), the Keycloak login pages now that the theme JAR finally loads (only registration was used: phase 12's open theme checks are still open), the nightly timer firing at 03:00 (the same `run()` was run by hand), Google sign-in.
- Left open:
  - Under the Watchlist filter, unstarring a card removes it at once; there is no undo.
  - The `userId`s of a cleanup's removals are logged at `warn`. That is fine for a dev log, but should be reviewed before a shared log store.
  - kafkajs cannot read Snappy, LZ4 or ZSTD. `rpk topic produce` compresses with Snappy by default (use `-z none`); such a message makes the identity consumer retry every 30 s until it is skipped (`rpk group seek`). Keycloak's listener sends uncompressed.
  - Redpanda in compose has no volume: recreating the container (as this phase's listener change did once) drops topics and consumer offsets.
- Defects noticed outside the scope, not fixed:
  - The BFF answers `500` (logged as "Unhandled error") for a request with `Content-Type: application/json` and an empty body. Fastify's `FST_ERR_CTP_EMPTY_JSON_BODY` carries `statusCode: 400`, but the error handler only passes `AppError` and validation errors through. The same handler pattern is in the SSE and portfolio services.
  - The consumer app (`stock-prices`) has the same kafkajs behaviour that the identity consumer needed a fix for: after a non-retriable crash it stops for good. Not verified there.
  - Phase 12's Docker mount had left `apps/keycloak-theme/dist_keycloak` as an empty root-owned folder, which broke the theme build. The owner removed it, and the new mount no longer causes it.
  - `apps/bff/src/routes/proxy.routes.test.ts` has an `as AddressInfo` cast (from phase 12).
  - Still open from earlier notes: the `DetailPanel` z-index (phase 14), the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the 360 feed tab's `landmark-one-main`, Dockerfiles missing workspace dependencies (no Dockerfile for `apps/portfolio` either), `tsconfig.app.tsbuildinfo` tracked in git (left out of the commits again), the `close` listener order in `stream.routes.ts`.

### After phase 16 (2026-11-25)
- Decided by the owner during the session (all four were the recommended options):
  - Alerts are managed on a new **`/alerts` page** (nav item "Alerts", between History and Settings): active alerts with Delete, triggered ones with Re-arm and Delete. The quote dialog has the create form and that symbol's active alerts. The **bell** sits next to the theme menu (sidebar foot, rail, phone header row) and opens a short list of recent triggers with a link to `/alerts`.
  - **Re-arm creates a copy** through the normal create endpoint (the history entry stays, it counts toward the cap, and it warns first when the price is already past). No re-arm endpoint.
  - **Browser notifications are included**, opt-in from a checkbox in the dialog's form and on the Alerts page.
  - **No Live Feed rows** for triggered alerts: toasts and the bell only. The feed stays trades only, so `useCandles` and History's live mode need no `type` filter (the phase 13 note's concern does not apply).
- Server, choices made here:
  - `price_alerts (id UUID default gen_random_uuid(), user_id, symbol, direction CHECK above|below, threshold NUMERIC(18,2) CHECK > 0, created_at, triggered_at NULL, triggered_price NUMERIC(18,2) NULL)`, with partial indexes for the active list and the history. Prices are two-decimal (the ingestor rounds to cents), so two decimals suffice. NUMERIC is selected as `::text`, never parsed into a float.
  - API: `GET /portfolio/alerts` → `{ active, history }` (active oldest first; history most recently triggered first, at most 50, older rows stay stored); `POST /portfolio/alerts` `{ symbol, direction, threshold }` → `201` with the alert; `DELETE /portfolio/alerts/:id` → `204`, idempotent, active or triggered; `POST /portfolio/alerts/:id/trigger` `{ price }` → `200 { first, alert }`. Amounts are decimal strings matching `PRICE_PATTERN` (at most two decimals, no sign or exponent). Fastify's default coercion turns a JSON number into its string first, and drops unknown fields (as in the watchlist routes); the app always sends strings.
  - Trigger: one `UPDATE … WHERE triggered_at IS NULL RETURNING`, so exactly one caller gets `first: true`; later callers get `first: false` and the alert as the first left it. **Addition to the plan:** the price must meet the condition (`400` otherwise), so history never shows a price that could not have fired it. An unknown id, or another user's, is `404` for trigger and a no-op `204` for delete.
  - Cap: 50 active (`409`), counted under `lockUser` like the watchlist. A threshold the price is already past is accepted; the client warns first.
  - `UserDataRepository.deleteUser` and `listUserIds` include `price_alerts` (K6), and `cleanup.ts` prepares the table too.
- Client, choices made here:
  - `alerts/alertsStore.ts` (unit-tested) evaluates every active alert against the latest price of its symbol whenever `prices` or the active list changes: `>=`/`<=` in whole cents (`alerts/money.ts`), no "crossed since the last tick". The snapshot event counts because it lands in `prices`. A crossing during a disconnect is caught on the first price after it. An alert whose trigger call is on its way is not called again. A failed or refused trigger is retried after 5 s, not every tick. A `404` drops the alert without a word. A reload that overlapped any write (create, delete, trigger) is ignored, except the first load, which is repeated.
  - `AlertsProvider` sits inside `WatchlistProvider` in `RequireAuth`. A separate `AlertEvaluator` child reads the stream's data context, so only it re-renders per tick. The list reloads on focus and visibility, like the watchlist.
  - Toasts stay until dismissed (at most 3 shown, with a link to the rest), so one that arrived while the tab was hidden is still there. They sit in a labelled region (`section aria-label="Alert notifications"`) with a polite live region, fixed bottom right (above the tab bar on phones), **outside `main`**: `main` is hidden while the narrow feed tab shows. Each has "Open AAPL" and "Dismiss".
  - Unseen count on the bell: triggers newer than `localStorage` `streamtick.alerts.seenAt`, set when the bell opens. Other tabs follow via the `storage` event. Accessible name "Alerts, 2 new".
  - Form: direction pills (At or above / At or below), price prefilled with the current price (`$`, commas and spaces are accepted), positive with at most two decimals. A met threshold turns the button into "Create anyway" with a warning; editing clears it. "Alerts are checked while Streamtick is open." is under the form, in the bell menu and at the top of the Alerts page.
  - Browser notifications: `localStorage` `streamtick.alerts.notify=on`, per browser and for every alert. Permission is requested only when the box is ticked. After a denial the box is disabled and says notifications are blocked. A notification is shown only by the tab that was first, and only while that tab is hidden (a visible tab has the toast).
  - `AlertsNotice` (inside `main`, after `WatchlistNotice`) says when a delete was refused and rolled back, or when the list cannot be loaded ("none are being checked" before any load; "the ones already loaded are still checked" after one), with Retry.
  - Narrow header: with the bell added, "Log out" wrapped at 360 px. The header gap is now 8 px and the cluster gap 6 px, the bell is 32 px square there, and "Log out" has `px-2` and `whitespace-nowrap` below 768 px. The row now ends exactly at the 16 px gutter at 360 px, so **anything else added there will not fit**.
- Verified against `pnpm dev` (turbo, without the theme's dev server) with the compose infra, logged in through `/bff/login` as a throwaway user registered on the app's sign-up page and deleted afterwards through Settings:
  - API through the BFF with a real session, 39 checks, run twice:
    - `401` without a session and `403` without `X-Requested-With`
    - create, with the symbol and threshold normalised; `400` for zero, negative, three decimals, an exponent, a bad direction, a malformed symbol and a missing field; `404` for an unknown symbol; a number coerced and an extra `userId` dropped, with the row still the caller's
    - trigger refused below the threshold; `first` once then `false` with the first price kept; **10 parallel triggers from two sessions give exactly one `first: true`**; below alerts
    - delete idempotent, then trigger `404`; malformed id `400`; another user's alert (inserted in SQL) is `404`/no-op and untouched
    - **6 concurrent creates at 47 active: 3 × `201`, 3 × `409`**, exactly 50 active; room again after one fires
    - history capped at 50, newest first; a delisted symbol is `listed: false`
  - "Done when", headless Chromium (Playwright 1.64): two tabs of one session. The alert was set from the dialog's form 5 cents above the live price, and tab B learned of it through a focus event. It fired after 3–37 s. Both tabs called trigger, exactly one got `first: true`, one toast appeared across the two tabs, and the row was triggered once. After a reload the bell said "Alerts, 1 new" and listed it, opening the bell cleared the count in the other tab too, and `/alerts` showed it under Triggered with its price. **9 of 10 runs passed. The output of the one failing run was not captured**; earlier failures were all test timing (the price moving between reading and submitting).
  - Edge cases, 25 checks, run twice: a mocked stream that sends only a `snapshot` past the threshold fires the alert at the snapshot's price; a mocked trigger `404` drops the alert silently; a mocked `503` gives 3 calls in 12.5 s, 5.0–5.2 s apart, with no toast, then fires once unmocked; Dismiss; a failed reload keeps the known alerts with the notice, and Retry clears it; a failed first load says none are being checked; a mocked `409` shows the server's message on the form; a refused delete is rolled back with a notice; Re-arm copies and keeps history; an already-met re-arm warns, then fires at once; the count "Active (1 of 50)"; focus moves to the next Delete. Notifications: headless permission denied (box disabled, reason shown); with a stubbed `Notification`, none is asked for on load, ticking asks once, there is no notification while visible, there is exactly one while hidden ("AAPL below $99,998.00", "Reached …"), and the toasts stay.
  - axe clean and no horizontal scroll (page, `main`, dialog content) at 360×740, 768×1024, 740×360 and 1440×900 in dark, and at 360 and 1440 in light: quotes with a toast, the open bell menu (inside the viewport, focus back on the bell after Escape), the dialog with the form and the past-threshold warning, and the Alerts page with active, delisted and triggered rows. 66 checks.
  - K6: the nightly cleanup (`pnpm --filter @stock-platform/portfolio cleanup`) removed a ghost user who had only an alert row and kept the live user's; deleting the account through Settings removed its 3 alert rows through `identity.events` (`removed: 3`, `source: self`).
  - Unit tests: portfolio 17 (5 new: cents, conditions), frontend 83 (13 new: money and `AlertsStore`), BFF 67. `pnpm build` passes.
  - Screenshots looked at: the dialog at 1440, the Alerts page at 360, a toast at 360 in light, the bell menu at 1440 and 768.
- Not checked: a real browser notification (only a stub: headless Chromium denies permission), a real background tab's throttling, Firefox and Safari, a real phone, a screen reader (the toasts' live region, the bell's count, the form's warning), and a real disconnect followed by a crossing (the snapshot path was tested with a mocked stream).
- Left open:
  - Alerts fire only while a tab is open (Q7). The plan's server-side worker (P2 "Future issues") needs S2 and a per-user event channel.
  - Triggered rows are never pruned; the list shows the newest 50. A retention rule (for example 90 days) would be a small job next to the nightly cleanup.
  - A toast that appears while the quote dialog is open is behind the modal for assistive technology (Radix hides the rest of the page), and is announced only once the dialog closes.
  - No `g a` shortcut for the Alerts page (D5 has `g q/c/h/s`).
  - The cap (50) is repeated as a constant in `AlertsPage.tsx` for display.
- Defects noticed outside the scope, not fixed:
  - When the dev run was stopped with SIGINT, the portfolio and consumer `tsx watch` processes stayed behind and had to be killed by PID (the same family as the SSE shutdown note).
  - Still open from earlier notes: the `DetailPanel` z-index (phase 14; toasts are `z-40` and show over the dialog sheet), the BFF's `500` for an empty JSON body (phase 15; the portfolio service has the same error handler), the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the 360 feed tab's `landmark-one-main`, Dockerfiles missing workspace dependencies (none for `apps/portfolio`), `tsconfig.app.tsbuildinfo` tracked in git (left out of the commits again), the `close` listener order in `stream.routes.ts`, the `as AddressInfo` cast in the BFF's proxy test.

### After phase 17 (2026-11-25)
- Decided by the owner during the session (all four were the recommended options):
  - **K6 deletes paper-trading orders** with the rest of the user's rows; they are not anonymised (closes the P3 "Future issues" question).
  - **Migration runner: hand-written and small**, in `packages/db`, no library.
  - **Order rules:** a price older than **5 s** refuses the order; at most **10,000 shares** per order; a position sold in full is **deleted** (realised P&L lives on the sell orders).
  - **Navigation:** Portfolio comes after Quotes in the sidebar. The **phone tab bar drops Alerts** (`sidebarOnly` in `navItems.ts`), which stays reachable through the bell in the phone header, so the bar keeps 6 tabs. Shortcut **`g p`** opens the portfolio. Before, `g` then `p` fell through to pause the feed; `p` alone still pauses.
- Migration runner, choices made here:
  - `runMigrations(pool, { dir, table, log })` in `@stock-platform/db`. Files are `NNNN_name.sql` (a `.sql` file named otherwise is an error), run in name order, **one transaction each** together with their row, and recorded with a sha256 checksum. A session advisory lock makes a second instance wait and then find nothing to do. It is forward only and strict: an edited applied file, an applied migration the code does not have, or a new file numbered before the last applied one stops the start. `CREATE INDEX CONCURRENTLY` cannot be used (it refuses a transaction).
  - The services share one database, so the history table is **per service**: `portfolio_schema_migrations`. The SSE service and the consumer still use `prepareSchema`; moving them over would be a later item.
  - `apps/portfolio/migrations/0001_watchlist_and_alerts.sql` takes over phases 15 and 16's tables with `IF NOT EXISTS` (existing databases keep their rows; verified on the dev database and on an empty one). `0002_paper_trading.sql` is plain DDL. The repositories' `prepareSchema` methods are gone; `app.ts` and `cleanup.ts` call `migrate()` first. **A new table means a new migration file, never an edit to an old one.**
  - The folder is found from `import.meta.url` (`../migrations/` from `src/` and from `dist/`), so a Docker image for the service must copy `migrations/` next to `dist/`.
- P3 server, choices made here:
  - Tables as in the plan, plus `orders.realized_pnl` (sells only, enforced by a CHECK) and an index on `(user_id, created_at DESC, id DESC)`. `cash >= 0`, `quantity > 0` and `avg_cost > 0` are CHECKs too.
  - Money is `bigint` in units of 10^-scale (`models/money.ts`): cents for cash, totals and P&L, scale 4 for prices and average cost. NUMERIC is read as text. The fill price comes from Redis as a float and is rounded to whole cents once (`centsFromQuote`). The total is therefore exact. The average cost is rounded half away from zero to 4 decimals, and realised P&L to cents. The fill logic is pure (`models/trading.ts`, `fillOrder`) and unit-tested.
  - `TradingRepository.withAccount` creates the account if needed (`INSERT … ON CONFLICT DO NOTHING`) and locks its row `FOR UPDATE`. The order runs inside that lock: it checks `clientOrderId`, reads the price, then validates and writes. A retry arriving while the first attempt is still running therefore waits and then gets the original. The phase 15 `lockUser` advisory lock is not used for orders; K6's `deleteUser` still takes it, and deleting a locked account row waits for the order.
  - API: `GET /portfolio/account` gives `{ cash, startingCash, realizedPnl, createdAt, positions[{ symbol, quantity, avgCost, listed, lastPrice, lastPriceAt }], sessionActivity[] }`. `POST /portfolio/account/reset` returns the fresh account. `GET /portfolio/orders?limit&before` returns `{ items, nextBefore }`, keyset paging by order id. `POST /portfolio/orders` answers `201` for a new order and `200` for a replayed `clientOrderId`. The error codes are `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `CLIENT_ORDER_ID_REUSED` (409) and `MARKET_DATA_UNAVAILABLE` (503). An unknown or delisted symbol is `404`, so a delisted position cannot be sold.
  - **The order body is validated by TypeBox's own compiler on that route only** (`strictValidatorCompiler` in `trading.routes.ts`), not Fastify's coercing Ajv: `"5"`, `1.5`, extra fields (a `price`) are `400`. The other routes keep the defaults described in phases 15 and 16.
  - Redis reads have a 1 s limit (`PriceReader`; ioredis would otherwise queue commands while it reconnects, with the account lock held). With Redis down, orders are `503` and the account reads still work, with each position priced at its last fill.
  - Day P&L: the server returns, per symbol traded in its current session (`sessionStartFor` per symbol, every registry symbol, so a position opened and closed today counts), the shares and totals bought and sold. The client computes `held_now × price − held_at_start × previous_close + sold_today − bought_today`. This measures older shares from `previousClose` and shares bought today from their fill, as the brief asks. Activity whose `sessionId` differs from the quote's is ignored (the session rolled over since the account was loaded).
- P3 client, choices made here:
  - `portfolio/money.ts` mirrors the server's bigint helpers. The alerts' number-based helpers are unchanged. `portfolio/valuation.ts` (unit-tested) values positions at live prices, falling back to the server's last price, which is labelled "last known". A delisted position is "Untradeable: no longer listed" and has no day P&L.
  - `PortfolioProvider` sits inside `AlertsProvider` in `RequireAuth`. It reloads on focus and visibility, after a fill, and **after a refusal** (another tab probably traded). Only the newest reload's answer is applied.
  - Trade ticket (in the quote dialog, above the alert form): Buy/Sell pills, shares, the estimated cost with the cash or the shares held, "Review order", then a confirm step that says the fill may differ, then the actual fill. One `clientOrderId` is made per review. A request with no answer is retried once with the same id. If it still fails, the ticket stays on Confirm ("Try again: the order will not run twice."). A refusal goes back to editing, and the next attempt gets a new id. The ticket checks shares and cash itself before sending, and the server checks again.
  - `/portfolio`: five summary tiles (total value, cash, market value, total P&L with %, day P&L), a positions table and the order history, 50 per page with "Load older orders". Some columns are hidden below `sm`/`md`.
  - Settings has a **Portfolio** section between Watchlist and Danger zone. "Reset portfolio" asks first; Cancel and the reset return focus to the button.
- Verified against `pnpm dev` (turbo, without the theme's dev server) with the compose infra, as a throwaway user registered on the sign-up page and deleted afterwards through Settings:
  - Migrations: two concurrent runs on the dev database apply 0001 once. An empty database gets both tables. An edited applied file stops the run with "changed after it ran". 0002 applied at the service's start.
  - API through the BFF, 54 checks, run twice:
    - `401` without a session and `403` without `X-Requested-With`; `400` for 11 malformed bodies (string, fraction, zero, negative, `1e9`, 10,001, a client `price`, bad side, bad id, a missing field, a malformed symbol); `404` for an unknown symbol; `409` for selling without a position.
    - Buy at Redis's price with an exact total; avg cost, cash and session activity; a repeat returns `200` with the original; the same id for another order is `409`; **8 parallel requests with one id give one `201`, seven `200` and one row**.
    - A partial sell keeps the avg cost and realises `(price − avg) × qty`; overselling is `409`; selling the rest deletes the row and stays in session activity.
    - **3 parallel buys of 60% of the cash each: one `201`, two `409`.**
    - After 24 mixed orders: **cash = start − buys + sells exactly**, positions = Σ bought − Σ sold per symbol, and cash + cost basis = start + realised P&L (drift −$0.004, from rounding the avg cost).
    - Paging; a stale price (ingestor stopped with SIGSTOP for 7 s) gives `503` while the account stays readable; reset; one account row.
  - Redis down, checked against the service directly (real Postgres, Redis paused): an order is `503` in 1.0 s, the account reads with last-fill prices, and both are logged at `warn`. Through the BFF this cannot be tested, because the BFF's sessions are in the same Redis.
  - Browser (headless Chromium, Playwright 1.64), 34 checks, run three times:
    - The ticket: estimate, focus on Confirm, a **double-click placing one order**, the result showing the server's fill price and total, focus on the result.
    - Sell, and Back returning focus to Shares; the client-side refusals.
    - A first attempt aborted is retried with the same `clientOrderId`. Answers lost twice keep Confirm, and a manual retry gets "already been placed" with one row.
    - **Two tabs buying 60% each at once: one fills, the other says "Not enough cash for this order" and reloads its cash.**
    - The page's tiles match the server, and the total value moves with the stream; 55 orders page as 50 + 5; `g p`; the sidebar order; Settings reset with Cancel and focus; the phone tab bar with 6 tabs, Portfolio and no Alerts.
  - axe clean and no horizontal scroll (page and dialog) at 360×740, 768×1024, 740×360 and 1440×900 in dark, and at 360 and 1440 in light: the Portfolio page with positions, the ticket on its confirm step and with an error, Settings asking to reset. 48 checks. Screenshots looked at: the page at 1440 and 360 (dark), the confirm step at 360 (light), the error at 1440, Settings at 1440 (light).
  - K6: deleting the account through Settings removed its 1 account, 3 position and 4 order rows (`removed: 8`, `source: self`). The nightly cleanup removed a ghost user who had only an account and an order.
  - Unit tests: db 9 (new), portfolio 28 (11 new), frontend 97 (14 new, the shortcut test adjusted), BFF 67. `pnpm build` passes.
- Not checked: a real phone, Firefox and Safari, and a screen reader (the ticket's steps, the result status, the tables). Not checked either: the session rolling over at UTC midnight with the Portfolio page open (the valuation's session check is unit-tested only), and two different users' first visits at the same moment (`ON CONFLICT DO NOTHING`, not raced).
- Left open:
  - **Day P&L assumes one session for the whole day.** `created_at` comes from the database's `now()` and the session start from the service's clock. They are the same machine today.
  - The trade ticket has no "max" button, and nothing shows when the price moved between Review and Confirm beyond the "estimate" label.
  - Orders are refused, not queued, outside a session; that does not matter while the market is 24/7 (P3 "Future issues": `MarketCalendar`).
  - Positions have no `INTEGER` overflow guard. 2^31 shares would need about $21M at $0.01, and above that Postgres would refuse the write (`500`).
  - The SSE service and the consumer still create their tables with `prepareSchema`, not migrations.
  - `docs/openapi.yaml` documents the new endpoints; the reset must be sent without a JSON `Content-Type` (see the BFF defect below).
- Defects noticed outside the scope, not fixed:
  - **The BFF needs Redis for every request** (sessions), so "Redis down: reads still work" from the P3 plan holds for the service only, not end to end.
  - **Pausing Redis for about 30 s crashed the consumer for good** (kafkajs "The coordinator is not aware of this member", `restart: false`), and prices went stale until it was restarted. This is the consumer defect suspected in phase 15's notes, now seen.
  - The BFF's `500` for an empty JSON body (phase 15) was hit again by a test calling the reset with `Content-Type: application/json` and no body.
  - Still open from earlier notes: the `DetailPanel` z-index, the `Sparkline` defects, SSE shutdown wedging `tsx watch`, "Connection lost" on a first load, the 360 feed tab's `landmark-one-main`, Dockerfiles missing workspace dependencies (none for `apps/portfolio`, which now also needs `migrations/`), `tsconfig.app.tsbuildinfo` tracked in git (left out of the commits again), the `close` listener order in `stream.routes.ts`, the `as AddressInfo` cast in the BFF's proxy test.
