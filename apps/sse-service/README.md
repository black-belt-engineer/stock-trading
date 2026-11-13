# SSE Service

The market API: realtime quotes over HTTP Server-Sent Events (from Redis) and
tick history (from the Postgres `stock_ticks` table the consumer writes).
Needs `REDIS_URL` and `DATABASE_URL`.

## Endpoints

- `GET /stream?symbols=AAPL,TSLA,GOOGL`
- `GET /quotes/:symbol/snapshot`
- `GET /quotes/discovery/active-stocks`
- `GET /quotes/:symbol/ticks?from=&to=&limit=&cursor=`: stored ticks, newest first
- `GET /quotes/:symbol/ticks.csv?from=&to=`: the same ticks as a CSV download, oldest first
- `GET /health`

## Stream events

- `snapshot`: the latest known quote per requested symbol, sent once on connect. State, not a trade.
- `price`: one event per new tick.

Both carry the same `StreamQuote` JSON payload.

## Tick history

`from` and `to` are ISO-8601 date-times with a time zone (`2026-11-13T10:00:00Z`).
`from` is inclusive, `to` exclusive. A missing `to` is now, a future `to` is
clamped to now, and a missing `from` is 15 minutes before `to`. A range may be
at most 24 hours; `from` must be before `to` (else `400`).

`/ticks` returns `{ symbol, from, to, ticks, nextCursor }`. `from` and `to` are
the range actually used; send them back unchanged with `cursor=<nextCursor>`
for the next, older page. `limit` defaults to 500 (at most 1000). Pagination is
keyset on `(time, idempotency_key)`, so ticks inserted meanwhile never shift a
page. An empty range is `200` with no ticks and `nextCursor: null`.

`/ticks.csv` streams `time,symbol,price,size,side` from a database cursor (the
file is never held in memory). `time` is ISO-8601 UTC with milliseconds; some
spreadsheet locales import it as text. An export holds at most 100,000 rows;
a larger range is `400`. An empty range is the header row only.

## Cloud Run Note

For SSE connections to remain open on Cloud Run, set request timeout to `3600s`.
