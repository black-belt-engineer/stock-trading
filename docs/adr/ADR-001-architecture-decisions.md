# ADR-001: Core architecture decisions (real-time stock price streaming)

## Overview

This record captures foundational choices for a **real-time stock price streaming platform**: browser delivery, ingestion pipeline, messaging, persistence, API framework, and repository layout.

---

### 1. Server-Sent Events (SSE) over WebSocket for the client stream

**Status:** Accepted

**Context:** The MVP must push price updates to browsers with low operational complexity. WebSockets are full-duplex and require connection management, load-balancer stickiness considerations, and often custom heartbeat logic for proxies. For a **read-only** streaming UI, bidirectional channels add complexity without clear benefit.

**Decision:** Use **SSE** as the primary transport from the streaming edge to clients for the MVP. Rely on browser-native EventSource semantics (including straightforward **automatic reconnect**) where applicable, and keep the protocol **server→client only**.

**Consequences:**

- **Positive:** Simpler mental model and infra for a read-only feed; built-in reconnect patterns in common clients; works well with HTTP/2 and familiar caching or CDN patterns where applicable.
- **Negative:** No native duplex channel over the same SSE connection (client commands must use separate HTTP calls); some corporate proxies or legacy stacks handle SSE less uniformly than WebSockets—monitor compatibility if needed.

---

### 2. Ingestor publishes only to Pub/Sub

**Status:** Accepted

**Context:** Market data ingestion must stay responsive even when downstream systems (databases, processors, or consumers) are slow or unavailable. Coupling the ingest path directly to durable storage or synchronous writes risks **blocking ingestion** or **dropping ticks** under pressure.

**Decision:** The **ingestor** writes **only** to a managed **Pub/Sub** (or equivalent durable messaging) topic. It does not synchronously persist full history or depend on consumer availability for ingest success.

**Consequences:**

- **Positive:** Clear boundary: ingestion completes when the message is accepted by the bus; storage outages do not stall ingestion if Pub/Sub remains healthy.
- **Negative:** Operational dependence on Pub/Sub availability and configuration (topics, quotas, ordering semantics if required); need explicit monitoring and dead-letter strategies for poison messages.

---

### 3. Consumer pulls from Pub/Sub

**Status:** Accepted

**Context:** Downstream services need to process price events at a sustainable rate. Push-only or fire-and-forget models can overwhelm a slow consumer or complicate recovery after downtime.

**Decision:** A **consumer** (or pool of consumers) **pulls** from Pub/Sub (or a pull-based subscription model), so the platform can use **platform-native backpressure** and **at-least-once** delivery with explicit acks. If a consumer is down, **messages wait** in the subscription (subject to retention and policy) rather than being lost at the edge.

**Consequences:**

- **Positive:** Backpressure and recovery are easier to reason about; scaling consumers can be tied to pull concurrency and processing time.
- **Negative:** End-to-end latency includes queueing time when consumers lag; idempotent processing and deduplication may be required depending on exactly-once needs.

---

### 4. Redis for real-time reads; Postgres for durable history

**Status:** Accepted

**Context:** The product needs both **low-latency, read-heavy** access for “current” prices and **durable, queryable** history for charts, compliance, and analytics. A single store rarely optimizes both without heavy tradeoffs.

**Decision:** Use **Redis** (or a similar in-memory / low-latency data store) for **real-time read paths** (e.g., latest quotes, hot windows). Use **Postgres** for **durable history** and structured queries (time series, symbols, sessions) with clear retention and backup policies.

**Consequences:**

- **Positive:** Right tool per access pattern; Postgres gives strong consistency and SQL for history; Redis gives fast reads for live surfaces.
- **Negative:** Two systems to deploy, secure, and keep consistent in meaning (e.g., what “latest” means during failures); need explicit failure modes if Redis and Postgres disagree temporarily.

---

### 5. Fastify over Express for Node HTTP services

**Status:** Accepted

**Context:** Services (including the SSE edge and internal APIs) need a mature Node HTTP framework. Express is ubiquitous but is not the only option; performance, validation, and TypeScript ergonomics matter for a high-throughput streaming stack.

**Decision:** Standardize on **Fastify** for new Node-based HTTP services: **strong performance** for request handling, **built-in JSON schema validation** for routes, and a **TypeScript-friendly** ecosystem and typing story.

**Consequences:**

- **Positive:** Less boilerplate for validation; typically better throughput for equivalent handlers; clear plugin model.
- **Negative:** Smaller community than Express (though large enough for production); team must align on Fastify patterns and plugin choices.

---

### 6. pnpm workspaces with Turborepo

**Status:** Accepted

**Context:** The platform spans multiple deployable apps (ingestor, consumer, SSE service, frontend) and shared libraries. Copy-pasting code or ad hoc linking creates drift; a monorepo must keep **builds fast** and **boundaries clear**.

**Decision:** Use **pnpm workspaces** for strict, efficient dependency layout and **Turborepo** for **task orchestration** and **incremental/cached** builds across packages.

**Consequences:**

- **Positive:** One repo for cross-cutting refactors; Turbo caching speeds CI and local builds; pnpm saves disk and keeps dependency graphs explicit.
- **Negative:** Onboarding cost for contributors unfamiliar with monorepos; need discipline in package boundaries to avoid a “big ball of mud.”

---

## Document history

| Date       | Change           |
| ---------- | ---------------- |
| 2026-05-03 | Initial decision |
