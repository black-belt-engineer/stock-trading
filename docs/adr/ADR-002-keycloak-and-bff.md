# ADR-002: Keycloak for identity, a backend-for-frontend for tokens

## Overview

Phase 12 replaced the hand-written authentication of phases 09–11 (`apps/auth`, `apps/user`, the frontend's token code) with Keycloak and a backend-for-frontend (BFF). This record covers four owner decisions, called Q10–Q13 in `roadmap/README.md`, and what each one gave up.

Date: 2026-11-18 (decided 2026-11-16; Q13 confirmed in phase 12).

---

### 1. Q10: Keycloak owns identity

**Status:** Accepted

**Context:** The hand-written services stored password hashes, issued ES256 tokens, rate limited logins and revoked sessions. Every feature added to that list (Google sign-in, email verification, password reset, roles) meant more security-sensitive code to write and keep correct.

**Decision:** Keycloak (realm `stock-platform`) handles registration, login, Google sign-in, password rules, brute-force protection and sessions. `apps/auth` and `apps/user` are deleted. The login and register pages are Keycloakify pages in the app's own design (`apps/keycloak-theme`). Settings does not edit accounts itself: its Profile, Password and Delete account buttons start Keycloak's application-initiated actions (`UPDATE_PROFILE`, `UPDATE_PASSWORD`, `delete_account`) through `/bff/login?action=…`.

**Consequences:**

- **Positive:** No password hashes, signing keys, rate limiters or internal service token to secure. Google sign-in, later email verification and roles are realm settings. Services verify RS256 tokens against Keycloak's JWKS (`JWKS_URL`).
- **Negative:** One more heavy service in compose, and the theme needs a JDK and Maven to build its JAR. The pages are a Keycloakify project that must follow Keycloak's major versions. Account changes leave the app for a Keycloak page and return. After a `delete_account` Keycloak shows its own info page and does not send the browser back; the BFF session lasts until its access token expires (up to 10 minutes) unless something else deletes it (phase 15's Kafka listener, K6).
- **Given up:** the single `users` table and its API (`/users*`), the custom email-change rules and the in-app forms for them.

---

### 2. Q11: tokens live in a BFF, never in the browser

**Status:** Accepted

**Context:** A token in the page can be read by any script that runs there (XSS), and a stolen refresh token works for days. Keeping it in an `httpOnly` cookie (Q2) was possible with the hand-written auth only for the refresh token; the access token still lived in memory. A `keycloak-js` setup would put both in the page.

**Decision:** `apps/bff` is a confidential Keycloak client (`stock-bff`, authorisation code with PKCE, standard flow only). It keeps the tokens in Redis and gives the browser one cookie, `session` (`HttpOnly`, `SameSite=Strict`, `__Host-` and `Secure` in production), that holds a random session id. The session value in Redis is encrypted with AES-256-GCM (key `SESSION_ENCRYPTION_KEY`, the Redis key as additional data). Routes: `GET /bff/login`, `GET /bff/callback`, `GET /bff/me`, `POST /bff/logout` and `POST /bff/backchannel-logout`. Logout ends the Keycloak session as well, through the end-session URL. A signed `login` cookie (`SameSite=Lax`, `Path=/bff/callback`, 10 minutes) carries `state`, `nonce`, the PKCE verifier and the validated `returnTo`.

**Consequences:**

- **Positive:** No token is readable by page scripts, in storage, in a response body or in `document.cookie`. The frontend lost its refresh logic, Web Locks and tab coordination: tabs share the cookie and one session. Ending a session in Keycloak reaches the BFF by back-channel logout, so a browser is logged out on its next request.
- **Negative:** The BFF and Redis are now required to be up for any signed-in request: Redis down is `503`. Sessions are a stateful store to operate. The refresh is single-flight per process only, and Keycloak's refresh-token rotation must stay off until a Redis lock replaces the in-process map.
- **Given up:** the "no server state for sessions" property of the old design, and calling the services straight from the browser.

---

### 3. Q12: start fresh, no account migration

**Status:** Accepted

**Context:** The only accounts were development and demo ones, and the old password hashes could not be imported into Keycloak without extra work.

**Decision:** Existing accounts are not migrated. `scripts/dev.sh` drops the `users` table once (`DROP TABLE IF EXISTS`). Old `auth:*` and `ratelimit:*` Redis keys expire on their own.

**Consequences:**

- **Positive:** No migration code. A user's id is now the Keycloak `sub`, a UUID, from the start, which later services (portfolio, alerts) use as `user_id`.
- **Negative:** Everyone registers again.
- **Given up:** the accounts and any per-user data that referred to the old ids (there was none beyond the table).

---

### 4. Q13: a token handler, not a token-mediating backend

**Status:** Accepted

**Context:** Two BFF shapes were possible. A token-mediating backend hands the access token to the page, which then calls the services itself; a token handler keeps every token and proxies the calls.

**Decision:** The BFF is a token handler. `/quotes/*` and `/stream` go through it (`@fastify/reply-from`), and it refreshes the access token when it is within 30 seconds of expiry, then forwards the request with `Authorization: Bearer` and drops the browser's cookie and any `Authorization` header it sent. The stream passes through unbuffered, with timeouts off. Every non-read request to the BFF needs `X-Requested-With: fetch`; the back-channel logout is the exception because Keycloak signs it instead. The services keep verifying tokens themselves, so the BFF is not a trust boundary they rely on.

**Consequences:**

- **Positive:** The page never holds even a short-lived access token (a stolen one would work for up to 10 minutes). The frontend's data calls are plain `fetch`, and a `401` means "go to login". The stream's `session-expired` event just causes a reconnect, and the BFF refreshes on that request.
- **Negative:** Every API request and the stream cost one extra hop, and the BFF must pass long-lived streams without buffering. Each new service that the browser calls needs a proxy route (portfolio later).
- **Given up:** Direct browser-to-service calls, and the lower latency and independence of the services from the BFF that they gave. The Vite dev proxy no longer sends `/quotes` and `/stream` to the SSE service.

---

## Open items

- K6 (phase 15): a Keycloak event listener to Kafka for `DELETE_ACCOUNT`, plus a nightly cleanup, so a deleted user's sessions and data go away at once.
- Redis lock for token refresh before the BFF runs as more than one instance.
- Not run for real: Google sign-in (needs credentials) and the theme JAR inside Keycloak (Maven was not installed while the phase was built).

## Document history

| Date       | Change           |
| ---------- | ---------------- |
| 2026-11-18 | Initial decision |
