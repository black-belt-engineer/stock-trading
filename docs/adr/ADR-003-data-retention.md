# ADR-003: Data retention for ticks, candles, Kafka and Redis

## Overview

Until phase 19, every store grew without limit: one Postgres row and one Redis marker per tick (about 518,000 a day with six symbols, more since the registry grew to 18), and a Kafka topic on the broker's default retention. This record covers how long each kind of data is kept and why, as decided by the owner in phase 19 (roadmap S3 steps 2–6, M4 step 3). ADR-001 §4 (Redis for real-time reads, Postgres for history) still stands; this adds the limits.

Date: 2026-11-25.

| Data | Where | Kept | Set in |
|---|---|---|---|
| Raw ticks | `stock_ticks` (hypertable, 1-day chunks) | 30 days, compressed after 2 days | `apps/consumer/src/repositories/tick-housekeeping.ts` |
| 1-minute candles | `candles_1m` (continuous aggregate) | Forever | same |
| Price messages | Kafka topic `stock-prices` | 12 hours, 1-hour segments | `packages/kafka/src/price-topic.ts`, `scripts/dev.sh` |
| Idempotency markers | Redis `consumer:processed:*` | 24 hours (`EX 86400`, phase 01) | `apps/consumer` |
| Everything in Redis | one instance | 256 MB ceiling, no eviction | `docker-compose.yml` |
| Account events | Kafka topic `identity.events` | 7 days (phase 15, unchanged) | `scripts/dev.sh` |

---

### 1. Candles come from a 1-minute continuous aggregate, kept forever

**Status:** Accepted

**Context:** The candle endpoint (phase 08) aggregated raw ticks on every request. Once raw ticks are dropped, that would also drop all older candles. A 1-day bar is one market session, whose edges come from `sessionStartFor` in `packages/symbols`. A continuous aggregate cannot express those edges, because it only buckets by fixed widths.

**Decision:** The consumer creates `candles_1m`, a continuous aggregate of `stock_ticks` with one row per symbol and minute: `first(price, time)`, `max`, `min`, `last(price, time)`, `sum(size)` and `max(time)` (`last_trade`, which the response's `lastTradeAt` needs). It is created `WITH DATA`, so it materialises all existing history before anything is dropped. Real-time aggregation is on (`materialized_only = false`): the open minute, and anything newer than the last refresh, come from raw ticks at query time. A refresh policy runs every minute and rematerialises buckets from 3 days ago up to 1 minute ago. The SSE service reads only the aggregate. `5m` and `1h` are `time_bucket` rollups of the 1-minute rows, and `1d` is a `width_bucket` over the session starts. Open and close of a rollup are `first(open, bucket)` and `last(close, bucket)`. There is no retention on the aggregate: about 26,000 rows a day for 18 symbols.

**Consequences:**

- **Positive:** Candles reach back further than raw ticks and no longer scan them. They matched raw SQL exactly when checked (401 bars, all four intervals, compressed chunks included).
- **Negative:** Every bucket edge must fall on a whole minute. Session starts at UTC midnight do; a real exchange calendar with odd-minute edges would need a finer aggregate. A tick that arrives for a minute that is already materialised (more than a minute late) is missing from that bar until the next refresh, at most one minute later. A tick more than 3 days late is never added to the aggregate. Kafka keeps only 12 hours (§3), so no tick can arrive that late.
- **Never do:** `refresh_continuous_aggregate('candles_1m', NULL, NULL)`, or any refresh window older than the raw retention. A refresh recomputes from raw ticks, and where they are gone it deletes the aggregate's rows for good.

---

### 2. Raw ticks: 30 days, compressed after 2 days

**Status:** Accepted

**Context:** `stock_ticks` held 311,000 rows (80 MB) after 13 days of intermittent running. A machine left running for weeks would fill its disk, because the Docker volume persists. Raw ticks serve tick history (M3, at most 24 hours per request), the CSV export (M6) and the consumer's cold-start baseline (M2, the current session only).

**Decision:** New chunks are 1 day long (`set_chunk_time_interval`). Retention and compression act on whole chunks, so this lets them act day by day. A retention policy drops chunks older than 30 days. A columnstore policy compresses chunks older than 2 days, with `segmentby = 'symbol'` and `orderby = 'time DESC, idempotency_key'`. The key is in the order-by so the unique index `(idempotency_key, time)` stays cheap to check on compressed chunks. A duplicate into a compressed chunk is still ignored by `ON CONFLICT DO NOTHING` (checked).

The order is fixed: aggregate first, then compression, then retention. If the aggregate cannot be set up, the consumer logs a warning and leaves retention off. Without TimescaleDB, or if the hypertable cannot be created, no policy is set, and the warning says so.

**Consequences:**

- **Positive:** Disk use levels off at about 30 days of ticks. Compressed chunks are a fraction of their size.
- **Negative:** Tick history and CSV export return nothing for ranges older than 30 days. Writing to a compressed chunk is slower. Ticks arrive at most 12 hours late (§3), well inside the 2-day horizon.
- **Changing a value:** every `add_*_policy` call uses `if_not_exists`, which keeps an existing policy unchanged. The consumer logs a warning at start when a policy differs from the constants. To apply a new value, remove the old policy by hand (`remove_retention_policy('stock_ticks')`, `remove_columnstore_policy('stock_ticks')` or `remove_continuous_aggregate_policy('candles_1m')`) and restart the consumer. Before shortening the aggregate's refresh window or the raw retention, re-read §1.

---

### 3. Kafka keeps price messages for 12 hours

**Status:** Accepted

**Context:** The consumer applies a tick to Redis once per idempotency key and keeps the marker for 24 hours (S3 step 1, phase 01). With the broker default of 7 days, a replay of messages older than a day (a reset consumer group, a new group) would apply them to Redis twice: day volume and highs counted again. Postgres would stay correct because of its unique index. Redpanda only deletes closed segments, and its default `segment.ms` is 14 days, so `retention.ms` alone would delete nothing.

**Decision:** `stock-prices` has `retention.ms = 43200000` (12 hours) and `segment.ms = 3600000` (1 hour). A service that creates the topic applies them (`PRICE_TOPIC_CONFIG_ENTRIES`). An existing topic is changed by `scripts/dev.sh` with `rpk topic alter-config`. Any other deployment must set them itself: `ensureTopic` never alters an existing topic.

**Consequences:**

- **Positive:** Every replayable message is at most about 13 hours old (12 hours plus the open segment), well inside its 24-hour marker.
- **Negative:** A consumer down for more than 12 hours finds its committed offset gone and starts at the latest offset (`fromBeginning: false`). The gap is lost: from Postgres, Redis and the candles. That is acceptable for simulated data. A real feed would need a longer retention, with the marker TTL raised to match.

---

### 4. Redis: a 256 MB ceiling, no eviction

**Status:** Accepted

**Context:** One Redis instance holds cache-like data (latest prices, sparklines, the price stream with `MAXLEN ~ 10000`), idempotency markers (24-hour TTL), rate-limit counters and the BFF's sessions (about 7-day TTL). Evicting a session logs a user out. Evicting a marker can double-apply a tick. `volatile-ttl` would mostly evict markers that are close to expiry, but its sampling is approximate, so it could still evict a session. Separate databases do not help, because `maxmemory` covers the whole instance.

**Decision:** `maxmemory 256mb` with `maxmemory-policy noeviction`, set on the compose service's command line. Every key that grows with the number of ticks now expires, so memory is bounded (about 24 MB at the time of writing). Reaching the ceiling therefore means a bug. Redis then refuses writes with an error instead of silently removing data.

**Consequences:**

- **Positive:** Nothing is ever lost silently. Runaway growth shows up as errors in the consumer and the BFF.
- **Negative:** At the ceiling, the consumer stops (its offsets are not committed, so it resumes once memory is freed) and new logins fail. An accidental `FLUSHALL` still logs every user out; sessions sharing the instance with the cache is the remaining risk (S3 "Future issues"). The compose Redis has no volume, so recreating the container (as the first `docker compose up` after this change does) empties it.

---

## Future work

- A real feed raises volume by orders of magnitude. Retention then becomes a cost decision per kind of data: ticks for days, minute bars for years, perhaps a compressed or downsampled aggregate.
- Regulated environments must keep trade records for years. That does not apply here, but it is why retention is written down rather than left to defaults.
- Sessions in their own Redis instance would remove the shared-memory risk in §4.
