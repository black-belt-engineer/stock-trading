# 04 · Auth

The auth service (`apps/auth`, port 3005) and user service (`apps/user`, port 3004) exist and work, but the frontend never calls them and the market endpoints are open. Confirmed decision: **everything sits behind login**.

Order: A1 first and alone. A2 and A3 must ship together; protecting the endpoints without a login UI locks everyone out.

---

## A1 · Ownership checks on user routes — score 61

**Problem.** In `apps/user/src/routes/user.routes.ts` the guard only proves the caller has *a* valid token. `request.authUserId` is set by the guard (`plugins/jwt-guard.ts:51`) and never compared with the `:id` parameter. Any logged-in user can `PATCH` another user's email and password or `DELETE` their account. `GET /users` returns every user to any caller. `POST /users/verify-credentials` is public by design for the auth service, but nothing stops an outside caller using it to guess passwords.

**Plan.**

1. `GET`, `PATCH`, `DELETE /users/:id`: return `403` unless `request.authUserId === params.id`. Add a `ForbiddenError` to `packages/errors`; it has no 403 class today.
2. Add `GET /users/me` so the frontend does not need to know its own id.
3. Remove `GET /users` or restrict it. There is no role concept, so removal is the honest option until an admin role exists.
4. Protect `POST /users/verify-credentials` with a shared secret header (`X-Internal-Token`) known to the auth service, configured through env in both services.
5. Changing the password must require the current password in the request body.
6. Changing the email should also require the current password, since email is the login identifier.

**Edge cases.**

- Access tokens are stateless and stay valid until expiry (up to `ACCESS_TOKEN_TTL_SECONDS`, 600). After a user deletes their account, their token still verifies for up to ten minutes. Every handler that loads the user must treat "not found" as `401`.
- Deleting a user does not revoke refresh tokens: they live in Redis as `auth:refresh:<hash>` with the user summary as the value, and there is no index by user. Add a per-user set of token hashes so "delete account" and "password changed" can revoke all sessions.
- Email change: the refresh token's stored summary and the access token's `email` claim are stale until the next refresh. Never use the claim for authorisation, only `sub`.
- Email case is already handled: the unique index and `findByEmail` both use `lower(email)` (`apps/user/src/repositories/user.repository.ts:52`). Keep that when adding the email-change check.
- The internal secret must be compared in constant time and must not be logged.

**Future issues.**

- A shared secret is the minimum. In a real deployment, the internal endpoint should not be reachable from outside the cluster at all (network policy), or services should authenticate each other with signed service tokens.
- An admin role will be needed eventually (user management, symbol registry). Plan a `role` claim rather than a second user table.

**Done when.** A request with user A's token to modify or read user B returns `403`, and calling `verify-credentials` without the internal header returns `401`.

---

## A2 · Shared JWT guard, protect quotes and stream — score 61

**Problem.** `/quotes/*` and `/stream` on the SSE service are unauthenticated. The guard lives inside `apps/user/src/plugins/jwt-guard.ts`, so other services cannot reuse it. The browser's `EventSource` cannot send an `Authorization` header.

**Plan.** *(Decided (Q1): fetch-based stream reader.)*

1. Move the guard into a shared package (`packages/auth-guard`) exporting `createJwtGuard`. `apps/user` imports it from there. Add `AUTH_SERVICE_URL`, `JWT_ISSUER` and `JWT_AUDIENCE` to the SSE service config (`apps/sse-service/src/config/index.ts`).
2. Apply the guard to `/quotes/*` and `/stream`. Leave `/health/*` open for probes.
3. Client: replace `EventSource` in `usePriceStream` with `fetch` plus a reader over the response body, sending `Authorization: Bearer …`. Write a small parser for the event-stream format: split on blank lines, read `event:`, `data:` and `id:` fields, ignore lines starting with `:`. Decode with a streaming text decoder so a multi-byte character split across chunks is not corrupted.
4. The hook already implements its own backoff and reconnect, so losing `EventSource`'s built-in reconnect costs nothing.
5. Token expiry on a long-lived stream: on connect, the server schedules the connection to close when the token's `exp` passes. The client treats that close as normal, refreshes its token and reconnects. Without this, a stream opened with a valid token stays open forever, including after logout.
6. On `401` from the stream or any quote call, the client refreshes once and retries; a second `401` logs the user out.
7. Dev proxy: add `/auth` → 3005 and `/users` → 3004 in `apps/frontend/vite.config.ts`.

**Edge cases.**

- The guard returns `503 JWKS_UNAVAILABLE` when it cannot reach the auth service to fetch keys. For the stream, the client must treat `503` as "retry with backoff", not "log out".
- Key rotation: the guard refetches keys for an unknown `kid`, but the auth service publishes exactly one key (`token.service.ts:31`). Rotating the key therefore invalidates every outstanding token at once. Publish the previous key alongside the new one during a rotation window.
- The stream handler currently writes SSE headers before any `await` (`stream.routes.ts:27`). The guard must run as a `preHandler`, before headers are sent, or a rejected request has already answered `200`.
- Clock skew between services makes fresh tokens look not-yet-valid or just-expired. Allow a small tolerance in verification.
- A refresh that lands exactly when the stream reconnects: ensure the reconnect waits for the in-flight refresh rather than sending the old token (A3's single-flight refresh).
- `fetch` streaming through some corporate proxies is buffered. The server already sets `X-Accel-Buffering: no`; the heartbeat from S1 also helps.
- A logged-out tab with an open stream: closing at `exp` bounds the exposure to one token lifetime. For immediate cut-off, the client aborts the fetch on logout.

**Future issues.**

- Every stream now reconnects at least every ten minutes (token TTL). Combined with one Redis connection per stream (S2), that is connection churn. S2 makes this cheap.
- Per-user connection limits become possible and useful (for example five concurrent streams per user); `ConnectionTrackerService` only keeps a global count today.
- Fallback if fetch streaming proves troublesome in practice: a one-time stream ticket in the query string (30-second TTL in Redis). This would be a change to decision Q1, not a free choice during implementation.
- Real market data licences usually require per-user entitlements and usage reporting; the guard is where an entitlement check would go.

**Done when.** `curl /quotes/AAPL/snapshot` without a token returns `401`, the dashboard works when logged in, and a stream opened with a token is closed by the server when that token expires.

---

## A3 · Login, register and session handling — score 75

**Problem.** The frontend has no login, no registration and no token handling. The auth API returns both tokens in the JSON body and expects the refresh token back in the body.

**Plan.** *(Needs U5. Decided (Q2): refresh token in an `httpOnly` cookie.)*

1. Auth service: on login and refresh, also set the refresh token as a cookie: `HttpOnly`, `SameSite=Strict`, `Secure` in production, `Path=/auth`. Accept the refresh token from the cookie when the body has none. Keep the body form working for non-browser clients.
2. Frontend auth context: holds the user and the access token **in memory only**. On app start it calls `/auth/refresh`; success means logged in, `401` means show login.
3. One API client module used by every request: attaches the access token; on `401` performs a refresh and retries once.
4. Single-flight refresh: if several requests fail at once, they share one refresh call. This is essential because refresh tokens are single-use (`RefreshTokenRepository.consume` uses `GETDEL`); two parallel refreshes mean the second fails and the user is logged out.
5. Proactive refresh shortly before `expiresIn` elapses, so the stream is not interrupted.
6. Pages: `/login` and `/register` (email, name, password of at least 8 characters to match `createUserBodySchema`). After registering, log in automatically.
7. Route guard: every route except those two requires a session; remember the requested URL and return to it after login.
8. Logout: call `/auth/logout`, clear memory, abort the stream, redirect to login.
9. Rate-limit `/auth/login` and `POST /users` by IP and by email, counting in Redis.

**Edge cases.**

- Two tabs: both refresh at the same moment, one wins, the other gets `401` because the token was consumed. Coordinate with a `BroadcastChannel` (one tab refreshes and shares the new access token), or on `401` wait briefly and retry using the cookie the other tab just received.
- Logout in one tab should log out the others; broadcast it.
- Page reload: memory is empty; the startup refresh restores the session. Show a splash state rather than flashing the login page.
- Cookie `Path=/auth` only works if the browser sees the auth API on the same origin as the app (dev proxy, or a production reverse proxy — Q9). On a different origin the cookie becomes third-party and browsers may block it.
- CSRF: `SameSite=Strict` covers the refresh endpoint in modern browsers. Additionally require a custom header (for example `X-Requested-With`) on `/auth/refresh` and `/auth/logout`, which a cross-site form cannot set.
- Registration with an existing email returns `409` with a message that confirms the account exists. Acceptable here; a real product would send a neutral response.
- Login error must stay generic ("Invalid email or password"), as `verifyCredentials` already does.
- Password managers need proper `autocomplete` attributes: `username`, `current-password`, `new-password`.
- The auth service is down: login shows "Service unavailable, try again", not "wrong password".
- Refresh token expired after seven days idle: the startup refresh fails quietly and the login page appears, keeping the requested URL.
- Post-login redirect target must be validated as a same-origin path to avoid open redirects.

**Future issues.**

- No email verification and no password reset. Both need an email provider, which is a third-party integration and out of scope for now; without reset, a forgotten password means a lost account. State this on the login page or add an admin reset later.
- Refresh-token reuse detection: if a consumed token is presented again, it may have been stolen; revoking the whole token family is the standard response and needs the per-user index from A1.
- A session list ("log out other devices") needs the same index.

**Done when.** A new user can register, land on the dashboard, reload without logging in again, stay logged in past the access-token lifetime, and log out from one tab and see the other tab follow.

---

## A4 · Settings page — score 56

**Problem.** The Settings nav item is dead. The user API already supports the needed operations.

**Plan.** *(Needs A1, A3, U5.)*

1. `/settings` with three sections: Profile (name, email), Password (current, new, confirm), Danger zone (delete account).
2. Profile and password use `PATCH /users/:id` with the current-password requirement from A1.
3. Delete account: confirmation dialog that requires typing the email, then `DELETE /users/:id`, then logout.
4. Preferences section for D4's theme and D3's default view once they exist.
5. Inline validation that mirrors the server schema; show server errors next to the field they belong to.

**Edge cases.**

- Email change to one already taken: `409`, shown on the email field.
- After a password change, other sessions should end (A1's revoke-all); the current session continues with a fresh token pair.
- After an email change, the name and email shown in the UI come from the auth context; update it from the `PATCH` response rather than waiting for the next refresh.
- Deleting the account must also delete the user's server-side data from the portfolio service (P1–P3). The user service and portfolio service are separate, so this needs either a call from one to the other or a "user deleted" event on Kafka. Until that exists, orphaned rows remain.
- Submitting the profile form with no changes: `updateUserBodySchema` requires at least one property; disable Save when nothing changed.
- Double-click on Save or Delete: disable the button while the request is in flight.

**Future issues.**

- Preferences stored server-side need a new column or table; do not overload the users table with UI state without a plan.
- Account deletion in a real product usually has a grace period and data export; out of scope here but worth noting in the UI copy.

**Done when.** A user can change their name, email and password and delete their account, and each action behaves correctly in a second open tab.
