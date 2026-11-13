# 01 · Bug fixes

Defects that make the data currently on screen wrong. Do these first.

---

## B1 · Fix sparklines (client + Redis) — score 75

**Problem.** There are two independent defects.

1. *Client.* The effect at `apps/frontend/src/App.tsx:61` depends on the whole `prices` map. Any symbol's tick re-runs it, and it appends `live.price` to **every** stock that has a quote. With six symbols each sparkline gains about six points per second, five of them duplicates, so the 30-point window covers roughly five seconds.
2. *Redis.* `apps/consumer/src/repositories/price-redis.repository.ts:32` does `ZADD sparkline <timestamp> <price>`. The sorted-set member is the price string, so when a price repeats, Redis moves the existing member instead of adding a point. The set holds *unique prices ordered by when last seen*, not a time series.

**Plan.**

1. Redis: make the member unique per tick, `"<timestamp>:<price>"`. Parse it in `LatestPriceRepository.findSparkline` (`apps/sse-service/src/repositories/latest-price.repository.ts:16`) by splitting on the first `:`.
2. Keep `ZREMRANGEBYRANK key 0 -31` so the newest 30 remain.
3. Client: append only when that symbol's quote is new. Compare `live.timestamp` with `stock.lastUpdated` and return the same `stock` object when it is not newer. This also lets `memo(PriceCard)` skip untouched cards.
4. Remove the wrong `changeValue` formula at `App.tsx:72` (`changePercent/100 * price` uses the new price as the base). Carry `changeValue` from the server instead, or drop the field until M2 defines it.

**Edge cases.**

- Old-format members (`"228.5"`) already in Redis after deploy: the parser must accept both formats, or delete `price:sparkline:*` once on deploy.
- Two ticks for one symbol in the same millisecond: identical member, one is lost. Acceptable for a sparkline.
- The first SSE message after page load is the snapshot that the REST call already included: the timestamp check in step 3 prevents a duplicate point.
- Reconnect after a gap: the line jumps from the last pre-gap point to the new one. Accept, or refetch `/quotes/discovery/active-stocks` on reconnect to rebuild.
- Clock skew: the comparison uses server timestamps on both sides, so the browser clock does not matter.
- Flat data (`max === min`): `Sparkline` already guards with `|| 1`; the line renders at the bottom rather than the middle. Cosmetic.

**Future issues.**

- With a real feed, ticks arrive in bursts (hundreds per second at the open). Thirty *ticks* then cover milliseconds. Switch the sparkline to time buckets (for example the last 30 one-minute closes from M3) before connecting a real source.
- Re-rendering six cards per second is fine; at 100+ symbols, batch updates per animation frame.

**Done when.** A card left open for 30 s shows 30 distinct points, and after a consumer restart the Redis set has 30 members even when prices repeat.

---

## B2 · Stop snapshot quotes entering the Live Feed — score 61

**Problem.** On connect, `apps/sse-service/src/routes/stream.routes.ts:30` sends the latest price for every symbol as ordinary `price` events. `usePriceStream` (`apps/frontend/src/hooks/usePriceStream.ts:68`) pushes every `price` event into the feed. The feed therefore shows six "trades" that never happened (`quantity: 0`, side guessed from the sign of the last change in `streamQuoteFromLatest`), and shows them again on every reconnect.

**Plan.**

1. Send the initial quotes under a different event name, `snapshot`.
2. In the hook, add a `snapshot` listener that updates `prices` only. Keep `price` updating both `prices` and `feed`.
3. Guard the hook's `JSON.parse` with try/catch; one malformed message currently throws inside the listener.

**Edge cases.**

- Server deployed before the client: old clients ignore `snapshot` events and show empty cards until the first tick (about one second). Deploy the client first, or accept the blip.
- Symbol with no latest price in Redis: no snapshot event is sent, and the card keeps its REST values.
- After a long disconnect, the feed mixes old and new entries with a silent time gap. Optionally insert a "reconnected" divider row.

**Future issues.**

- S1 (resume with `Last-Event-ID`) replays missed ticks on reconnect. Decide then whether replayed ticks belong in the feed; they are real trades, so probably yes, but capped.
- With a real feed the feed list needs throttling: 20 rows turning over hundreds of times a second is unreadable.

**Done when.** A fresh page load shows an empty feed until the first real tick, and reconnecting adds no rows by itself.

---

## B3 · Detail dialog: live data, chart, error state — score 66

**Problem.** `apps/frontend/src/components/DetailPanel/index.tsx` fetches `/quotes/:symbol/snapshot` once. The numbers then freeze while the cards behind keep moving. If the response is not OK or the fetch rejects, `data` stays `null` and the skeleton and "Loading..." header never go away (line 57). The rejection is also unhandled.

**Plan.**

1. Pass the live `ActiveStock` for the selected symbol from `App` into the dialog. Render price, change and a larger sparkline from it, so the dialog updates with the stream and needs no fetch for those values.
2. Keep the snapshot fetch only for fields the live object lacks (high, low, volume, previous price). Track `status: "loading" | "ready" | "error"` instead of a boolean.
3. Use an `AbortController` and abort on close or symbol change so a slow response for a previous symbol cannot overwrite the current one.
4. Error state: message plus a Retry button. Header shows the name from the live object immediately instead of "Loading...".
5. Small fixes: add `+` to positive change values; replace the redundant "Symbol" tile; constrain width with `min(420px, calc(100vw - 32px))`.
6. Until M2 lands, relabel the tiles honestly: "High / Low since start", "Previous tick". After M2 they become real session values.

**Edge cases.**

- Open A, close, open B quickly: without step 3 the response for A can arrive last and display under B's header.
- Symbol removed from the list while its dialog is open: close the dialog when the live object disappears.
- 404 for a symbol that has no ticks yet: show "No data yet", not an error.
- Stream down while the dialog is open: show the same stale indicator as the cards (U4).
- The dialog opens before the first stream message: render from the REST list values.

**Future issues.**

- After A2 the snapshot call returns 401 when the token expires; route it through the shared API client from A3 so it refreshes and retries.
- Once M4 exists, the dialog should link to the full chart page rather than grow into one.

**Done when.** The dialog price changes in step with its card, a blocked request shows an error with a working Retry, and switching symbols quickly never shows mismatched data.
