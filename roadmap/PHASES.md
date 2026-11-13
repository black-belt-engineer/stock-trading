# Phases

The roadmap cut into pieces that each fit one working session. `README.md` gives the reasons for the order; this file is the tracker. To run a phase, start a fresh chat and say: **Read roadmap/PROMPT.md and follow it.**

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
| 07 | M3, M6 | 03-market-data.md | 05 | in progress |
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
- **Known defect, raise it when changing `StreamQuote`:** the consumer builds the stream payload from the latest-price record, so every feed row has `quantity: 0` and a buy/sell side guessed from the price change. The real size and side are on the `PriceEvent`. Ask the owner whether to fix it here; D2 (phase 12) displays quantity and needs it.

### 07 · History and export (M3, M6)
- M3 first, then M6.
- Postgres access goes into the SSE service (plan step 1), not a new service.
- Auth does not exist yet, so the CSV download can be a plain link for now; phase 10 changes it to a blob fetch.

### 08 · Candle chart (M4)
- Steps 1, 2, 4, 5 and 6. Step 3 (continuous aggregates) is in phase 18.
- Hand-written SVG (README Q5); no charting library.
- Check the TimescaleDB docs for `time_bucket`, `first` and `last` before writing the query.
- Daily bars must align with M2's session boundary (phase 06 is done): take the bucket edges from `sessionStartFor` in `packages/symbols`, not from a hard-coded UTC day, so a real exchange calendar later moves both together.

### 09 · Ownership checks (A1)
- Backend only (`apps/user`, `apps/auth`, `packages/errors`). No login UI.
- Independent of the UI and market-data phases; can be done at any point before phase 10.

### 10 · Guard and login (A2, A3)
- The two items ship together. Do not leave the branch in a state where endpoints are protected and no login exists.
- Decided: fetch-based stream reader (Q1), refresh token in an `httpOnly` cookie (Q2).
- Existing callers to route through the new API client: the symbol list fetch (now in `stream/useSymbolList.ts`, called by `StreamProvider`; a `401` there must also count as logged out), and, if phases 07 and 08 are done, history, candles and the CSV download (blob fetch with the header).
- The stream hook must tell `401` (logged out) from `503` (retry) from a dropped connection (U4's banner). The hook is used only through `StreamProvider`; the router is React Router 7 in declarative mode (`BrowserRouter`), so the route guard is a layout route around the shell.
- This is the largest phase. If it will not fit one session, finish A2's server side and the API client first, record exactly where you stopped under "Notes between phases", and leave the status `in progress`.

### 11 · Settings page (A4)
- Deleting an account cannot clean up portfolio data until phase 14 exists; record that as an open item rather than inventing a mechanism.
- The Preferences section stays empty until D3 and D4 exist.

### 12 · Search, feed controls, table view (D1, D2, D3)
- In that order; D3's header sort shares D1's sort state.
- "Sort by change" sorts by the day change (`changePercent`, against the previous close, phase 06). Symbols with `null` change sort last.
- The sector filter is already in the URL (`?sector=<id>`, phase 05), built in `QuotesPage` with `SectorFilter`. Add search and sort beside it as further params, and put D1's filter, search and sort into the one `useMemo` that today only filters by sector.
- D2 shows trade quantity: feed rows carry the real trade size (`quantity`) and side since phase 06.
- S1's event ids do not exist until phase 17; keep the current feed row keys.

### 13 · Light theme and shortcuts (D4, D5)
- D4 first.
- D4 needs every colour to come from a token; grep for leftover `rgba(` and hex values before starting.
- Phase 04 set dark-theme values for AA: `--text-secondary` `#7d89a4` and `--negative` `#f56674`. The light theme needs its own values checked the same way; the axe script approach in the phase 04 notes covers it.
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
- Day P&L uses M2's `previousClose` (phase 06); a position opened today is measured from its fill price instead.

### 17 · Stream resilience (S1, S2)
- S2 first is easier: S1's resume is served from S2's ring buffer.
- S1's client watchdog replaces U4's temporary "no message for 15 s" rule (`SILENCE_LIMIT_MS` in `usePriceStream.ts`). With the ingestor down that rule reconnects every 15 s; a heartbeat ends that.
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
- Open: Kafka retention versus the 24-hour marker (phase 18 brief). Open: feed rows carry `quantity: 0` and a guessed side (phase 06 brief; fixed in phase 06).

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
- Contract change: entries in the `price:updates` Redis stream now hold the `LatestPrice` record in `payload`, not a `StreamQuote`. The SSE service maps them with `streamQuoteFromLatest`, so the record-to-quote mapping lives in one place. Entries in the old format are skipped. S1 (phase 17) resumes from these entries.
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
