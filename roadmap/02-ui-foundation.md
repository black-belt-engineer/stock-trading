# 02 · UI foundation

Groundwork that later features build on. Order inside this file: U1, U5, U4, U2, U3.

---

## U1 · Move inline styles to Tailwind classes — score 66

**Problem.** Every component styles itself with `style={{…}}`. Inline styles cannot express `:hover`, `:focus-visible`, `:disabled`, media queries or `prefers-reduced-motion`. That is the root cause of several audit findings: no hover or focus feedback, no responsive layout, no reduced-motion fallback. Tailwind 4 is installed and imported (`apps/frontend/src/styles/global.css:2`) but unused.

**Plan.**

1. Expose the tokens in `tokens.css` to Tailwind as theme colours so classes such as `bg-surface` and `text-secondary` exist. Check the Tailwind 4 theming documentation for the exact directive before writing it.
2. Rename the misleading tokens while touching them: `--accent-teal` is lime (`#e2f73f`) and duplicates `--accent-lime`. Use role names: `--accent-brand`, `--positive`, `--negative`, `--warning`.
3. Convert one component per commit, smallest first: `ConnectionStatus`, `FilterPills`, `Sidebar`, `Topbar`, `PriceCard`, `PriceGrid`, `LiveFeed`, `DetailPanel`, then the grid in `App.tsx`.
4. Add the interaction states during conversion: hover and `focus-visible` ring on cards, pills and nav; `disabled:` styles; `motion-reduce:` variants on the flash and pulse animations.
5. Decide the buy/sell colour: the feed uses brand lime for "buy" while cards use green for "up". Use `--positive` / `--negative` for both.

**Edge cases.**

- Tailwind's base reset already applies (it is imported), so conversion should not shift layout; verify each component visually rather than assuming.
- Values that are computed at runtime (sparkline geometry, dynamic colours from data) stay as inline styles or CSS variables.
- Radix components expose state through `data-state` attributes; style the active pill with those rather than a JS `active` flag.
- Dialog overlay `backdrop-filter` is expensive on low-end devices; keep it but drop it under reduced-motion/low-power if it stutters.

**Future issues.**

- A half-converted codebase is worse than either extreme. Finish the migration before starting U2.
- D4 (light theme) depends on every colour going through a token; any hard-coded `rgba(...)` left behind (there are several in `PriceCard` and `DetailPanel`) will break it.

**Done when.** No component has a static `style` prop, tab focus is visible everywhere, and hovering a card changes its appearance.

---

## U5 · Routing and real navigation — score 68

**Problem.** Three of four sidebar items (`apps/frontend/src/components/Sidebar/index.tsx:9`) are permanently disabled, and there is no router, so new pages have nowhere to live. The filter pills "Finance" and "Energy" are also dead, and "Tech" returns everything (`App.tsx:83`).

**Plan.** *(Decided (Q6): a router library.)*

1. Add a router and an app shell: sidebar and connection status persist, the centre column is the route outlet.
2. Routes: `/` (quotes), `/chart/:symbol?`, `/history/:symbol?`, `/settings`, later `/login`, `/register`, `/portfolio`.
3. Lift `usePriceStream` into a context provider at shell level so the stream survives navigation instead of reconnecting on each page.
4. Sidebar items become links with `aria-current="page"`; remove `role="menuitem"`.
5. Until its page exists, **remove** a nav item rather than showing it disabled. Add each back with its feature (M3, M4, A4).
6. Remove the dead pills now; M1 brings back real sector filters.
7. Put the open symbol in the URL (`/?symbol=AAPL`) so the detail dialog is linkable and the back button closes it.

**Edge cases.**

- Deep link or refresh on `/chart/AAPL`: the dev server handles this; a production static host needs a fallback to `index.html` (the reverse proxy from decision Q9).
- Unknown symbol in the URL: show a "symbol not found" state, not a blank page.
- Unknown route: a simple 404 page with a link home.
- Back button with the dialog open should close the dialog, not leave the page.
- Lowercase symbol in the URL: normalise to upper case and replace the URL.

**Future issues.**

- After A3, every route except login and register needs a guard, and the post-login redirect must return to the originally requested URL (validate that it is a same-origin path).
- Code-splitting the chart page becomes worthwhile once M4 adds weight.

**Done when.** Every visible nav item leads somewhere, refresh keeps the current page, and the stream does not reconnect when navigating.

---

## U4 · Loading, empty, error and stale states — score 66

**Problem.** If `/quotes/discovery/active-stocks` fails, the grid is blank with no message (`App.tsx:52`). The feed has no placeholder. With no data, "Last Update" falls back to the current time and reads "0s ago" (`App.tsx:88`). When the stream drops, cards keep showing old prices as if live; only the small pill in the sidebar changes, and there is no way to retry.

**Plan.**

1. Give the bootstrap fetch a status (`loading | ready | error`). Loading: skeleton cards. Error: message with Retry. Ready and empty: "No symbols available".
2. Feed placeholder: "Waiting for trades…".
3. Topbar: show "—" when there has been no update; never substitute the current time.
4. Stale handling: when stream status is not `live` for more than about three seconds, show a banner ("Connection lost — prices may be out of date", with Retry now) and dim the cards. Add a `retry()` function to `usePriceStream` that cancels the backoff timer and reconnects.
5. Per-card staleness: if a card's `lastUpdated` is older than a threshold while the stream is live, show a small "delayed" marker.
6. Add `aria-live="polite"` to the connection status so screen readers hear changes.
7. Listen for the browser `online` event and retry immediately instead of waiting out the backoff.

**Edge cases.**

- Backend up but ingestor down: the stream is `live` and silent. Step 5 covers this; the banner alone does not.
- Background tabs throttle timers, so "x seconds ago" jumps on return. Recompute on `visibilitychange`.
- Laptop sleep: the connection is dead on wake but may not fire `error` promptly. A heartbeat (S1) is the real fix; until then, treat "no message for 15 s" as disconnected.
- Flapping connection: debounce the banner (step 4's three seconds) so it does not flicker.
- The current backoff tops out at 30 s and retries forever; keep that, but show the countdown so the user knows something is happening.

**Future issues.**

- A real market is closed most of the week. "No ticks for 15 s" will then be normal; the staleness rules must become session-aware (M2) and show "Market closed" instead of "delayed".
- After A2, a 401 on the stream means "logged out", not "connection lost". The hook must distinguish and redirect to login.

**Done when.** Stopping the SSE service shows the banner within a few seconds, starting it again clears it, and stopping only the ingestor marks the cards as delayed.

---

## U2 · Responsive layout — score 64

**Problem.** The page grid is fixed at `220px 1fr 300px` (`App.tsx:93`), the feed and sidebar have fixed widths, and the dialog is 420px wide. Below roughly 800px the centre column collapses.

**Plan.** *(Needs U1.)*

1. Three breakpoints: wide (three columns, as now); medium (sidebar collapses to an icon rail, feed becomes a toggleable drawer); narrow (single column, bottom tab bar, feed as its own tab).
2. Make the shell `height: 100dvh` with independently scrolling regions, so the sidebar and connection status stay in view while the grid scrolls. Today the whole page scrolls and `overflowY: auto` on `main` has no effect because nothing constrains its height.
3. Topbar stats: four across on wide, 2×2 on narrow.
4. Dialog: full-screen sheet on narrow screens.
5. Raise the base font from 13px to 14px, and the 10–11px labels to at least 12px.

**Edge cases.**

- Phone landscape: little height; the bottom bar must not cover content, respect `env(safe-area-inset-bottom)`.
- Company names such as "Microsoft Corporation" at 260px card width: truncate with ellipsis and a `title`.
- Prices with more digits (five-figure prices on a real feed): let the price shrink or wrap rather than overflow.
- Browser zoom at 200% must not hide the feed toggle.
- The feed drawer open during a route change: close it.

**Future issues.**

- More symbols (M1) make the card grid long on phones; the table view (D3) should become the default there.
- The chart page (M4) needs its own narrow-screen behaviour, including touch crosshair.

**Done when.** The app is usable at 360px, 768px and 1440px wide without horizontal scrolling.

---

## U3 · Accessibility pass — score 56

**Problem.** Measured and observed issues:

- `--text-muted` (`#363d52`) on the sidebar background is 1.75:1 and is used for 10px feed timestamps. WCAG AA needs 4.5:1.
- `--text-secondary` (`#6b7894`) measures 3.76–4.26:1 across the three surfaces, used at 11px.
- `PriceCard` is an `<article onClick>`: not focusable, not operable by keyboard.
- Price flashes and pulses run continuously with no `prefers-reduced-motion` handling.
- `index.html` has no meta description or `theme-color`.
- Fonts load via a CSS `@import` from Google Fonts (`global.css:1`), which blocks rendering and is the UI's only external request.

**Plan.** *(Needs U1.)*

1. Lighten `--text-secondary` until it reaches 4.5:1 on `--bg-elevated`, the darkest pairing. Stop using `--text-muted` for text; keep it for borders and decoration.
2. Make the card a `<button>` (or wrap its content in one) with an accessible name: "AAPL, Apple Inc., $228.50, up 0.12%".
3. Do **not** put `aria-live` on prices; a screen reader would announce six changes per second. Live regions only for connection status and alerts.
4. Under reduced motion, replace the flash and pulse animations with a static colour.
5. Direction is already shown by arrows as well as colour; keep that rule for every new component (buy/sell keeps its B/S letter).
6. Self-host the two fonts as WOFF2 in `public/` with `font-display: swap`.
7. Close button in the dialog: add `aria-label="Close"`; the bare "×" is read as "times".

**Edge cases.**

- A button containing an SVG sparkline: mark the SVG `aria-hidden`.
- Focus must return to the originating card when the dialog closes. Radix does this when the trigger is known; with the current controlled `open` prop it may not, so test it.
- Lime brand colour on a light background (D4) fails contrast; the light theme needs its own accent value.
- Tabular alignment: prices use a monospaced font already; keep it for any new numeric column.

**Future issues.**

- Every new component must be checked in both themes; add a short checklist to the pull-request template rather than repeating this pass.
- Charts (M4) need a text alternative: a summary line and a data table view.

**Done when.** The whole dashboard can be operated with the keyboard alone, and all text passes AA in an automated contrast check.
