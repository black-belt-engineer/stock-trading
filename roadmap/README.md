# Streamtick roadmap

Feature backlog for the platform, scored and ranked, with an implementation plan, edge cases and likely future problems for each item. Written on 2026-11-12 from a read of the code; the app was not run.

## Decisions this roadmap is built on

These were confirmed by the project owner and shape every plan:

| Topic | Decision | Consequence |
|---|---|---|
| Goal | Portfolio / learning project | Scores favour visible results and low effort, then technical depth |
| Data source | Simulated now, real feed later | Daily stats, history and candles are designed around market *sessions*, not a rolling 24h window |
| Auth scope | Everything behind login | `/quotes/*` and `/stream` need a token; the dashboard is unreachable when logged out |
| Personal data | Server-side from the start | Watchlist, alerts and paper trading need Postgres tables and APIs, and depend on login (A2, A3) |

## Scoring

Each feature gets 1–5 on four criteria. The score is the weighted sum, scaled to 0–100.

| Criterion | Weight | 5 means | 1 means |
|---|---|---|---|
| Demo impact | 35% | Obvious to anyone opening the app | Invisible to a viewer |
| Ease | 30% | An hour or two, one or two files | Several days, multiple services |
| Learning value | 20% | Teaches a transferable backend/frontend technique | Routine work |
| Unblocks | 15% | Several other features depend on it | Nothing depends on it |

`score = (35·Demo + 30·Ease + 20·Learning + 15·Unblocks) / 5`

The score ranks desirability. It does **not** give the build order: several high scorers depend on lower-scored groundwork (see "Build order").

## Ranked backlog

| # | ID | Feature | Demo | Ease | Learn | Unblocks | Score |
|---|---|---|---|---|---|---|---|
| 1 | B1 | [Fix sparklines (client + Redis)](01-bug-fixes.md) | 4 | 5 | 2 | 3 | **75** |
| 2 | M2 | [Session-based daily stats](03-market-data.md) | 5 | 2 | 4 | 4 | **75** |
| 3 | A3 | [Login, register and session handling](04-auth.md) | 4 | 2 | 5 | 5 | **75** |
| 4 | M3 | [History endpoint and page](03-market-data.md) | 4 | 3 | 4 | 4 | **74** |
| 5 | M4 | [Candle chart page](03-market-data.md) | 5 | 2 | 5 | 2 | **73** |
| 6 | U5 | [Routing and real navigation](02-ui-foundation.md) | 3 | 4 | 2 | 5 | **68** |
| 7 | P1 | [Watchlist](06-personal.md) | 4 | 3 | 3 | 3 | **67** |
| 8 | B3 | [Detail dialog: live data, chart, error state](01-bug-fixes.md) | 4 | 4 | 2 | 2 | **66** |
| 9 | U1 | [Move inline styles to Tailwind classes](02-ui-foundation.md) | 3 | 3 | 3 | 5 | **66** |
| 10 | U4 | [Loading, empty, error and stale states](02-ui-foundation.md) | 4 | 4 | 2 | 2 | **66** |
| 11 | M1 | [Symbol registry with sectors](03-market-data.md) | 3 | 4 | 2 | 4 | **65** |
| 12 | D1 | [Search and sort](05-dashboard.md) | 4 | 5 | 1 | 1 | **65** |
| 13 | U2 | [Responsive layout](02-ui-foundation.md) | 4 | 3 | 3 | 2 | **64** |
| 14 | P3 | [Paper trading](06-personal.md) | 5 | 1 | 5 | 1 | **64** |
| 15 | B2 | [Stop snapshot quotes entering the Live Feed](01-bug-fixes.md) | 3 | 5 | 1 | 2 | **61** |
| 16 | A1 | [Ownership checks on user routes](04-auth.md) | 1 | 5 | 3 | 4 | **61** |
| 17 | A2 | [Shared JWT guard, protect quotes and stream](04-auth.md) | 2 | 2 | 5 | 5 | **61** |
| 18 | P2 | [Price alerts](06-personal.md) | 4 | 2 | 4 | 1 | **59** |
| 19 | D2 | [Feed controls](05-dashboard.md) | 3 | 5 | 1 | 1 | **58** |
| 20 | S1 | [SSE heartbeat and resume](07-streaming.md) | 2 | 3 | 5 | 2 | **58** |
| 21 | U3 | [Accessibility pass](02-ui-foundation.md) | 2 | 4 | 3 | 2 | **56** |
| 22 | A4 | [Settings page](04-auth.md) | 3 | 4 | 2 | 1 | **56** |
| 23 | D4 | [Light theme](05-dashboard.md) | 3 | 4 | 2 | 1 | **56** |
| 24 | S2 | [Shared Redis reader for all SSE clients](07-streaming.md) | 1 | 3 | 5 | 3 | **54** |
| 25 | M5 | [Top movers](03-market-data.md) | 3 | 4 | 1 | 1 | **52** |
| 26 | D3 | [Table view toggle](05-dashboard.md) | 3 | 4 | 1 | 1 | **52** |
| 27 | M6 | [CSV export](03-market-data.md) | 2 | 4 | 2 | 1 | **49** |
| 28 | D5 | [Keyboard shortcuts](05-dashboard.md) | 2 | 4 | 2 | 1 | **49** |
| 29 | S3 | [Data housekeeping](07-streaming.md) | 1 | 4 | 3 | 2 | **49** |

## Build order

Dependencies, not scores, decide the sequence.

| Phase | Items | Why here |
|---|---|---|
| 1. Correct what is on screen | B1, B2, B3, S3 | Small, independent, and every later feature builds on correct data |
| 2. UI groundwork | U1, U5, U4, U2, U3 | U1 enables hover/focus/responsive; U5 gives the new pages somewhere to live |
| 3. Market data | M1, M2, M3, M4, M5, M6 | M1 before M2 (sessions are per symbol); M3 before M4 and M6; M2 before M5 |
| 4. Auth | A1, A2, A3, A4 | A1 must land before any login UI exists; A2 and A3 ship together or the app locks itself out |
| 5. Easy dashboard wins | D1, D2, D3, D4, D5 | No dependencies; can be pulled forward any time after phase 2 as short breaks from the larger work |
| 6. Personal features | P1, P2, P3 | Need A2 + A3; P3 also needs M2 for day P&L |
| 7. Streaming depth | S1, S2 | Worth doing before any load test or real feed |

Dependency summary:

```
B1 ─┐
U1 ─┼─> U2, U3, U4, D3, D4
U5 ─┴─> M3 page, M4 page, A3 pages, A4, P3 page
M1 ──> M2 ──> M5, P3 (day P&L)
M3 ──> M4, M6
A1 ──> A2 + A3 (ship together) ──> A4, P1, P2, P3
S2 ──> cheaper A2 stream auth, P2 server-side evaluation
```

## Design decisions

Confirmed by the project owner on 2026-11-13: the recommended approach for every open question. Plans cite these as "Decided (Qn)". The rejected alternative is kept for context.

| # | Question | Decision | Rejected alternative |
|---|---|---|---|
| Q1 | How does the browser authenticate the SSE stream? `EventSource` cannot send an `Authorization` header. | Replace `EventSource` with a `fetch` streaming reader that sends the header | One-time ticket in the query string, or cookie auth |
| Q2 | Where does the browser keep the refresh token? | `httpOnly`, `SameSite=Strict` cookie set by the auth service; access token in memory only | `localStorage` (simpler, exposed to XSS) |
| Q3 | What is a "trading day" for the simulated 24/7 market? | One session per UTC calendar day | Rolling 24h window, or simulated NYSE hours |
| Q4 | Where do watchlist, alerts and paper trading live? | One new service, `apps/portfolio`, port 3006 | Extend `apps/user`, or one service per feature |
| Q5 | How are candles drawn? | Hand-written SVG component | A charting library |
| Q6 | Client-side routing | A router library | Hand-rolled hash routing |
| Q7 | Where are alerts evaluated in v1? | In the browser, against the live stream, while a tab is open | A server worker that pushes alert events |
| Q8 | Paper trading rules | $100,000 starting cash, market orders only, whole shares, no shorting, no fees | Limit orders, fractional shares, fees |
| Q9 | How does production serve one origin for four backends? | A reverse proxy in front (not yet in `infra/`) | CORS on every service |

Work these decisions add that is not a feature of its own:

- **Q6:** the specific router library is still to be picked when U5 starts.
- **Q9:** the reverse proxy does not exist yet. It is only needed for a production deployment; local development uses the Vite proxy. The `httpOnly` cookie from Q2 depends on it in production.
- **Q7:** alerts only fire while a tab is open. The UI must say so (see P2).

## Files

| File | Contents |
|---|---|
| [PHASES.md](PHASES.md) | The work cut into session-sized phases, with status and hand-over notes |
| [PROMPT.md](PROMPT.md) | The one prompt used to start every phase in a fresh chat |
| [01-bug-fixes.md](01-bug-fixes.md) | B1–B3: defects that make current data look wrong |
| [02-ui-foundation.md](02-ui-foundation.md) | U1–U5: styling, layout, accessibility, states, routing |
| [03-market-data.md](03-market-data.md) | M1–M6: symbols, daily stats, history, candles, movers, export |
| [04-auth.md](04-auth.md) | A1–A4: ownership, guard, login, settings |
| [05-dashboard.md](05-dashboard.md) | D1–D5: small frontend-only features |
| [06-personal.md](06-personal.md) | P1–P3: watchlist, alerts, paper trading |
| [07-streaming.md](07-streaming.md) | S1–S3: stream resilience and data housekeeping |
