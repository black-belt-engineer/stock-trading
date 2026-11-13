# 03 · Market data

Backend-led features that make the numbers meaningful and unlock the Chart and History pages. Order: M1, M2, M3, M4, M5, M6.

Design constraint (confirmed): prices stay simulated now, but a real feed comes later. Every plan here therefore models **sessions** and treats the tick source as replaceable.

---

## M1 · Symbol registry with sectors — score 65

**Problem.** The symbol list exists three times: `apps/ingestor/src/constants.ts` (`SYMBOL_CONFIG`), `apps/sse-service/src/constants.ts` (`DEFAULT_SYMBOLS`) and `apps/frontend/src/App.tsx:12` (`SYMBOLS`). Adding a symbol means editing three services. There is no sector data, which is why the sector filters were dead.

**Plan.**

1. Create one registry in `packages/types` (or a new `packages/symbols`): `{ symbol, name, sector, exchange, seed }[]`. The ingestor and SSE service import it.
2. Add `sector` and `exchange` to the `ActiveStock` response of `/quotes/discovery/active-stocks`.
3. Frontend: delete the hard-coded `SYMBOLS`. Fetch the list first, then open the stream for the returned symbols.
4. Build filter pills from the distinct sectors in the response.
5. Add 10–15 more simulated symbols across at least three sectors so the filters, sort and movers have something to show.
6. Validate symbols at the API edge: `/quotes/:symbol/*` and `/stream?symbols=` should reject anything not matching `^[A-Z][A-Z0-9.\-]{0,9}$` and anything not in the registry (404).

**Edge cases.**

- `usePriceStream` reconnects whenever its `symbols` array identity changes; pass a stable, sorted, memoised list.
- The stream must not open before the list arrives, or it opens with an empty query, which the server interprets as "all defaults" (`parseSymbols`).
- New symbol with no ticks yet: `getActiveStocks` returns zeros (`quotes.service.ts:27`). Return `null` prices and render "—", not `$0.00`.
- Class shares such as `BRK.B` contain a dot; the validation regex and URL encoding must allow it.
- A symbol removed from the registry leaves keys in Redis and rows in Postgres. Harmless, but the Redis keys never expire.
- More symbols means a longer `symbols=` query string; fine for dozens, not for thousands.

**Future issues.**

- A real feed has thousands of symbols that change (listings, delistings, renames). The registry then moves to a Postgres table with an admin path, and discovery needs pagination.
- The ingestor starts one interval per symbol (`ingestion.service.ts:33`); fine at 20, wasteful at 500. Switch to one scheduler loop when the count grows.
- Kafka has 6 partitions keyed by `symbol:timestamp`, so per-symbol ordering across partitions is not guaranteed. This matters for M2; see there.

**Done when.** Adding a symbol is a one-line change in one file and it appears in the grid, the stream and the sector filter.

---

## M2 · Session-based daily stats — score 75

**Problem.** `changePercent` is computed against the previous tick (`apps/consumer/src/repositories/price-redis.repository.ts:67`), so the badge and "Best/Worst Performer" flip every second. `high24h`, `low24h` and `volume24h` are never reset; they are all-time values with a 24h label. "Prev Close" is the previous tick.

**Plan.** *(Decided (Q3): a session is one UTC day while simulated.)*

1. Add a small `MarketCalendar` module in a shared package: `sessionIdFor(timestamp, exchange)` returns a session key such as `2026-11-12`. The simulated implementation uses the UTC date. A real implementation later uses exchange hours and holidays; nothing else changes.
2. Extend `LatestPrice` with `sessionId`, `open`, `high`, `low`, `volume`, `previousClose`, `change`, `changePercent` (the last two relative to `previousClose`). Keep the tick-to-tick direction as a separate `tickDirection` field for the flash animation.
3. In the consumer, when a tick's session differs from the stored one: set `previousClose` to the stored last price and reset open, high, low and volume.
4. Make the update atomic. Today it is read-modify-write with a `GET` before a `MULTI` (`buildLatestPrice`), which loses updates if two consumers handle the same symbol. Use a Lua script or `WATCH`.
5. Cold start (empty Redis, or first tick of a brand-new symbol): fetch the previous session's last tick from `stock_ticks`; if none, use the first price as `previousClose` so the change starts at 0%.
6. Rename fields through the API and UI: "24h High" becomes "Day High", and so on. Update `StreamQuote` so the stream carries the day change.
7. Add a `source` column to `stock_ticks` now. `PriceEvent.source` exists but is not stored, so simulated and real ticks would later be indistinguishable in the table.

**Edge cases.**

- A tick stamped 23:59:59.999 processed after one stamped 00:00:00.001: derive the session from the event timestamp, never the processing time, and ignore ticks older than the stored `lastUpdated` for the latest-price update (still insert them into Postgres).
- Out-of-order delivery is possible today because the Kafka key is `symbol:timestamp`, which spreads one symbol across partitions. Either key by symbol alone (and carry the idempotency key in a header or the payload), or keep the "ignore older" rule above. Changing the key changes the idempotency contract in `kafka-consumer.service.ts:67`.
- Replay after a consumer crash: the idempotency marker prevents double-counting volume; the Lua script must check the marker inside the same atomic step.
- Ingestor restart resets prices to the seed values (`price-event.service.ts:18`), producing an artificial jump of several percent. Persist the last price or read it from Redis at startup.
- No ticks during an entire session: the next session's `previousClose` is the last known price, not zero.
- `previousClose` of 0 would divide by zero; guard it.
- Browser open across midnight: the first tick of the new session carries the new `sessionId`; the client resets its day values from the payload rather than computing its own.
- Volume as a JavaScript number is safe to 2^53; fine.

**Future issues.**

- Real markets: pre-market and after-hours sessions, half days, holidays, and halts. The calendar module is the single place to add them.
- Splits and dividends change `previousClose` overnight without a trade; a real feed delivers adjustment factors that must be applied.
- Real feeds also send corrections and cancelled trades, which require recomputing high/low from stored ticks instead of trusting the running value.
- A random walk with ±0.5% per second drifts far within a day (prices can double or halve). Consider a mean-reverting simulation so demo values stay plausible.

**Done when.** The change badge stays stable between ticks of the same direction, day values reset at the session boundary, and restarting the consumer does not change any displayed day value.

---

## M3 · History endpoint and page — score 74

**Problem.** Every tick is written to `stock_ticks` (`apps/consumer/src/repositories/stock-tick.repository.ts`) and nothing reads it. The History nav item is dead.

**Plan.**

1. Decide the owner: the SSE service currently has Redis only. Add Postgres access to it via the existing `packages/db` plugin and rename it conceptually to a "market API", or create a separate read service. For this project size, adding it to the SSE service is the smaller change.
2. Endpoint: `GET /quotes/:symbol/ticks?from=&to=&limit=&cursor=`. Defaults: last 15 minutes, `limit` 500, maximum 1000. Order by time descending.
3. Use keyset pagination: the cursor encodes `(time, idempotency_key)` of the last row. Offset pagination becomes slow and unstable while rows are being inserted.
4. The existing index `stock_ticks_symbol_time_idx (symbol, time DESC)` already serves this query.
5. Validate with TypeBox like the auth and user routes do: ISO timestamps, `from < to`, a maximum range (for example 24 hours per request).
6. Frontend `/history/:symbol?`: symbol picker, time-range presets, table (time, price, size, side), "Load more". Format times in the user's locale with an explicit time zone label.

**Edge cases.**

- `price` is `DOUBLE PRECISION`, `size` is `NUMERIC` (returned by `pg` as a string): convert explicitly in the repository.
- Empty range: return `200` with an empty list and no cursor, not `404`.
- Unknown symbol: `404` (M1's validation).
- `to` in the future: clamp to now.
- Rows with identical timestamps: the cursor's second component keeps pagination stable.
- A user on the first page while new ticks arrive: keyset pagination means "Load more" never repeats or skips rows; new ticks appear only on refresh. Offer a "Live" toggle that prepends from the stream.
- Consumer lag: the newest ticks may be in Redis but not yet in Postgres. The table can be a few seconds behind the cards; say so in a caption if it is noticeable.

**Future issues.**

- Volume: 6 symbols at one tick per second is about 518,000 rows a day; 20 symbols is about 1.7 million. See S3 for retention and compression. Without it, queries slow down and the disk fills.
- A real feed multiplies this by orders of magnitude; raw tick history then needs per-user limits and stricter range caps.
- After A2 the endpoint needs the guard; consider per-user rate limiting because this is the most expensive query in the system.
- The table falls back to a plain Postgres table if TimescaleDB is missing (`prepareSchema` logs a warning). Performance assumptions then no longer hold; make this failure loud in production.

**Done when.** The History page lists ticks for a chosen symbol and range, pages backwards without duplicates, and a 24-hour query returns in well under a second.

---

## M4 · Candle chart page — score 73

**Problem.** There is no chart beyond the 30-point sparkline. The `OhlcvBar` type already exists in `packages/types/src/index.ts` ("Phase 3") and is unused.

**Plan.** *(Needs M3's Postgres access. Decided (Q5): hand-written SVG.)*

1. Endpoint: `GET /quotes/:symbol/candles?interval=1m|5m|1h|1d&from=&to=`, returning `OhlcvBar[]`, maximum 500 bars per request.
2. First version: aggregate on demand with TimescaleDB `time_bucket` plus `first(price, time)`, `max`, `min`, `last(price, time)`, `sum(size)`. Check the TimescaleDB documentation for exact function signatures before writing the query.
3. Second version, when queries get slow: continuous aggregates for `1m`, with coarser intervals rolled up from it.
4. Live candle: the client builds the current, unfinished bar from stream ticks and replaces it with the server's bar when the bucket closes.
5. Chart component: SVG candles, a volume strip, a price axis, a time axis, a crosshair with an OHLC readout, interval switcher. Fixed window of the latest N bars first; pan and zoom later.
6. Enable the Chart nav item; link to it from the detail dialog.

**Edge cases.**

- Buckets with no trades: decide between leaving a gap and carrying the previous close forward as a flat bar. Gaps are honest for a real market (nights, weekends); flat bars read better for the 24/7 simulation. Make it a parameter.
- Bucket boundaries: fix them to UTC and state it. Daily bars must align with M2's session boundary or the "1d" bar disagrees with the day stats.
- The server's last bar is partial. Mark it `complete: false` so the client knows to keep updating it.
- The live bar built in the browser can differ from the server's (missed ticks during a reconnect). On reconnect, refetch the last two bars.
- Flat bar (open = close): draw a line, not an invisible zero-height rectangle.
- All bars equal (new symbol): avoid dividing by a zero price range when scaling.
- Long ranges on small intervals (a month of 1m bars): enforce the 500-bar cap and return a clear `400` telling the client to use a larger interval.
- If the Timescale extension is unavailable, `time_bucket` does not exist. Fall back to `date_trunc` for whole-unit intervals or return `501` with a clear message.

**Future issues.**

- Continuous aggregates need a refresh policy and interact with retention (S3): raw ticks can be dropped once the aggregates cover them, but not before.
- Real data needs split-adjusted history and session-aware daily bars.
- Hand-written SVG is good for learning but pan, zoom, touch gestures and indicators are a lot of work. If the chart becomes the centrepiece, moving to a charting library is a legitimate later decision.
- SVG slows down past a couple of thousand nodes; keep the bar cap or switch to canvas.

**Done when.** The chart shows candles for all four intervals, the last candle moves with the stream, and its OHLC matches a manual SQL check for the same bucket.

---

## M5 · Top movers — score 52

**Problem.** "Best Performer" and "Worst Performer" in the Topbar are computed client-side from tick-to-tick change, so they are noise.

**Plan.** *(Needs M2.)*

1. With M2 in place, the client already has the day change for every symbol. Compute top three gainers and losers in the browser from the loaded list; no endpoint needed at this size.
2. Replace the two Topbar tiles with a compact movers strip showing symbol and percent; clicking opens the detail dialog.
3. Add a server endpoint (`GET /quotes/movers?limit=`) only when the symbol count outgrows "load everything" (M1 future issue).

**Edge cases.**

- Fewer than six symbols: do not list the same symbol as both gainer and loser.
- All changes zero (start of session): show "—".
- Ties: break by symbol name so the order does not flicker.
- Rank changes every second near ties: update the strip at most every few seconds.
- The current filter: decide whether movers respect it. Recommended: movers are market-wide and ignore the filter, labelled as such.

**Future issues.**

- With thousands of real symbols this must be server-side, backed by a Redis sorted set of change percent maintained by the consumer.
- Low-priced, low-volume symbols dominate percentage rankings on real data; a minimum volume threshold becomes necessary.

**Done when.** The movers strip is stable between ticks and matches the cards' day change.

---

## M6 · CSV export — score 49

**Problem.** No way to take data out of the platform.

**Plan.** *(Needs M3.)*

1. `GET /quotes/:symbol/ticks.csv?from=&to=` with `Content-Type: text/csv` and a `Content-Disposition` filename such as `AAPL_2026-11-12.csv`.
2. Stream rows from Postgres to the response using a cursor; do not build the file in memory.
3. Columns: ISO-8601 UTC time, symbol, price, size, side. Header row included.
4. Cap the range (for example 24 hours) and the row count; return `400` beyond that.
5. Frontend: "Export CSV" button on the History page using the current filters.

**Edge cases.**

- After A2 the endpoint needs a token, and a plain link cannot send an `Authorization` header. Fetch as a blob with the header and trigger the download from the blob.
- Client disconnects mid-download: stop the database cursor and release the connection; otherwise connections leak from the pool.
- Empty result: return the header row only.
- Spreadsheet software interprets cells starting with `=`, `+`, `-` or `@` as formulas. All current fields are safe (numbers and fixed strings); keep it that way or prefix-escape if free text is ever added.
- Excel reads ISO timestamps as text in some locales; document the format rather than localise it.

**Future issues.**

- Real market data is usually licensed with redistribution limits; exporting it may not be permitted. Gate the feature by data source.
- Large exports compete with live queries for the same connection pool; move to a read replica or background job if it is used heavily.

**Done when.** Exporting one hour of ticks downloads a file whose row count matches the History page, with flat server memory during the download.
