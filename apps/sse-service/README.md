# SSE Service

Realtime quote streaming service over HTTP Server-Sent Events.

## Endpoints

- `GET /stream?symbols=AAPL,TSLA,GOOGL`
- `GET /quotes/:symbol/snapshot`
- `GET /quotes/discovery/active-stocks`
- `GET /health`

## Stream events

- `snapshot`: the latest known quote per requested symbol, sent once on connect. State, not a trade.
- `price`: one event per new tick.

Both carry the same `StreamQuote` JSON payload.

## Cloud Run Note

For SSE connections to remain open on Cloud Run, set request timeout to `3600s`.
