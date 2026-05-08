# SSE Service

Realtime quote streaming service over HTTP Server-Sent Events.

## Endpoints

- `GET /stream?symbols=AAPL,TSLA,GOOGL`
- `GET /quotes/:symbol/snapshot`
- `GET /quotes/discovery/active-stocks`
- `GET /health`

## Cloud Run Note

For SSE connections to remain open on Cloud Run, set request timeout to `3600s`.
