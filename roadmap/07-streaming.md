# 07 · Streaming and housekeeping

Low on demo impact, high on learning value. S3 is cheap and belongs in phase 1; S1 and S2 should be done before any load test or real feed.

---

## S1 · SSE heartbeat and resume — score 58

**Problem.** The stream sends nothing when there are no ticks, so proxies and load balancers with idle timeouts close it, and a half-dead connection (laptop sleep, lost Wi-Fi) is not detected by the client. On reconnect, every tick published during the gap is lost: the reader starts from `$`, meaning "new entries only" (`apps/sse-service/src/services/stream-subscription.service.ts:54`). The stream also writes no `id:` field, although each entry in the Redis stream already has a unique, ordered id.

**Plan.**

1. Heartbeat: write a comment line (`: ping`) every 15 seconds per connection. Comment lines are part of the SSE format and are ignored by parsers. Clear the timer on close.
2. Client watchdog: if nothing arrives (data or heartbeat) for about 35 seconds, treat the connection as dead and reconnect. This replaces the temporary rule in U4.
3. Event ids: include `id: <redis stream id>` with each `price` event.
4. Resume: the client sends the last id it saw in a `Last-Event-ID` header on reconnect (the fetch reader from A2 sets it explicitly). The server starts `XREAD` from that id instead of `$`.
5. Bound the replay: if the id is older than a limit (for example 60 seconds or 2,000 entries), or has been trimmed, skip the replay and send a fresh `snapshot` instead.
6. Send `retry: <ms>` once at connect as a hint for clients that honour it.
7. Close the gap at connect: the initial snapshot is read first and `XREAD` starts afterwards, so ticks published in between are missed. Read the stream's current last id before taking the snapshot and start reading from it.

**Edge cases.**

- The stream is trimmed with `MAXLEN ~ 10000` (`packages/types/src/index.ts`). At 6 ticks per second that is about 28 minutes; at 20 symbols, about 8 minutes. An older `Last-Event-ID` cannot be honoured: fall back to the snapshot.
- Validate the `Last-Event-ID` format (`<digits>-<digits>`) before passing it to Redis; it is client-controlled input.
- Replayed ticks arrive in a burst. The client should apply them to prices and charts but cap how many enter the feed (see B2).
- The same tick delivered twice (replay overlaps live): the client de-duplicates by event id.
- Replay must still filter by the connection's symbol set.
- A slow client: `reply.raw.write` returns `false` when the socket buffer is full, and the code ignores it (`stream.routes.ts:37`). Memory then grows per slow connection. Track backpressure and drop the connection (or skip intermediate ticks) when it stays behind.
- Heartbeats keep connections alive that the server should close for other reasons (token expiry in A2); the expiry timer takes precedence.

**Future issues.**

- With several SSE service instances behind a load balancer, resume works across instances because the ids come from Redis, not from process memory. Keep it that way.
- A Redis failover can lose recent stream entries; an id from before the failover may no longer exist. The snapshot fallback covers it.
- At real-feed rates, per-tick delivery to browsers is wasteful. Conflate: send at most one update per symbol per 100–250 ms, which also changes what "resume" needs to replay (only the latest per symbol).

**Done when.** Pausing the browser's network for ten seconds and resuming shows no gap in the History "Live" view, and an idle connection stays open through a proxy with a 30-second idle timeout.

---

## S2 · Shared Redis reader for all SSE clients — score 54

**Problem.** `StreamSubscriptionService.subscribe` calls `this.redis.duplicate()` and runs a blocking `XREAD` loop **per browser connection**. A thousand viewers means a thousand Redis connections, each receiving and parsing every tick for every symbol and discarding most of them. Reader errors are also dropped: `stream.routes.ts:35` passes no `onError`, so a failing loop retries silently every second forever.

**Plan.**

1. One reader per process: a single duplicated connection and a single `XREAD` loop, started lazily with the first subscriber and stopped after the last one leaves.
2. An in-process registry `Map<symbol, Set<subscriber>>`. Each entry is parsed once and dispatched only to the subscribers of that symbol.
3. Serialise the SSE frame once per tick and write the same string to every subscriber.
4. Keep a small ring buffer of recent entries (ids and frames) in memory to serve S1's resume without a Redis round trip per reconnect.
5. Error handling: log reader errors, back off exponentially, and after reconnecting send every client a fresh `snapshot` since ticks may have been missed.
6. Report readiness honestly: `/health/ready` should fail when the reader has been disconnected beyond a threshold.
7. Expose subscriber count and reader lag (now minus the timestamp of the last entry) on `/health`.

**Edge cases.**

- Subscriber set mutated during dispatch (a client disconnects while its frame is being written): iterate over a copy or tolerate removal during iteration.
- One subscriber throwing must not stop delivery to the others; wrap each write.
- A slow subscriber must not delay the loop: writes are non-blocking, combined with S1's backpressure rule.
- Start and stop races: the last subscriber leaves while a blocking read is in flight, then a new one joins. Use a reference count and never run two loops.
- Graceful shutdown: stop the loop, end all responses, then quit the Redis connection (the project already has a shutdown helper in `packages/env`).
- The blocking read holds its connection; keep using a duplicate so ordinary commands on the main connection are not stalled.

**Future issues.**

- Fan-out is now CPU-bound in one Node process. Scale by running more instances; each has one reader, so Redis connections grow with instances rather than viewers.
- Plain `XREAD` (no consumer group) is correct here because every instance must see every entry. A consumer group would split entries between instances, which is wrong for fan-out.
- Per-user events (P2 server-side alerts, P3 order fills) need a second registry keyed by user id on the same reader, or a separate stream.

**Done when.** A hundred concurrent stream clients produce exactly one extra Redis connection, and stopping and restarting Redis recovers without restarting the service.

---

## S3 · Data housekeeping — score 49

**Problem.** Three stores grow without limit.

1. **Idempotency markers.** `price-redis.repository.ts:45` writes `consumer:processed:<key>` with no expiry. That is one permanent Redis key per tick: about 518,000 per day with six symbols.
2. **Tick history.** `stock_ticks` has no retention or compression: the same 518,000 rows per day, more with M1.
3. **Per-symbol keys.** `price:latest:*` and `price:sparkline:*` for removed symbols are never deleted.

**Plan.**

1. Give the marker a TTL: `SET key 1 EX 86400`. It only needs to outlive the longest plausible redelivery window. Existing markers need a one-off cleanup using `SCAN` with a pattern and `UNLINK` in batches; never `KEYS` on a live instance.
2. Add a TimescaleDB retention policy for raw ticks (for example 30 days) and a compression policy for chunks older than a few days. Check the TimescaleDB documentation for the current policy functions and their arguments before writing them.
3. Order matters with M4: create the candle aggregates before enabling retention, or history older than the retention window is gone for good.
4. Guard both policies: `prepareSchema` already tolerates a missing extension; skip the policies in that case and log a clear warning.
5. Set `maxmemory` and an eviction policy on Redis deliberately. The data mixes cache-like keys with refresh tokens, which must not be evicted; `volatile-ttl` or separate Redis databases are options.
6. Write the ADR follow-up: `docs/adr` has decisions for Kafka, Redis and Postgres but nothing on retention.

**Edge cases.**

- A marker that expires before a very late redelivery lets a tick be applied to Redis twice. With M2 this would double-count volume. Postgres stays correct because of its unique index. A 24-hour TTL makes this practically impossible while Kafka retention is shorter; check that it is.
- The unique index is `(idempotency_key, time)` because hypertables require the partition column in unique indexes. Deduplication therefore relies on the timestamp being identical on redelivery, which holds since it comes from the event.
- Compressed chunks are slower or impossible to update; late-arriving ticks older than the compression horizon will fail or be costly. Keep the horizon longer than any realistic lateness.
- The cleanup script must be safe to stop and re-run.
- The local Docker volume `stock-postgres-data` persists between runs; a developer machine left running for weeks fills its disk without retention.

**Future issues.**

- A real feed raises volume by orders of magnitude; retention then becomes a cost decision per data type (ticks for days, minute bars for years).
- Kafka topic retention is not set in the repo; with the default, the topic also grows. Set it explicitly alongside these policies.
- Regulated environments require keeping records for years. Not relevant to a portfolio project, but it is why retention should be a documented decision rather than a default.
- The refresh-token keys share this Redis instance; an accidental flush or eviction logs every user out.

**Done when.** The count of `consumer:processed:*` keys levels off after 24 hours, and the Postgres volume size stops growing once the retention window is reached.
