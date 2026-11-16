# 08 · Identity provider

Phases 09–11 built login, registration, sessions, rate limits and account settings by hand in `apps/auth` (port 3005) and `apps/user` (port 3004). The owner decided on 2026-11-16 to hand identity to **Keycloak**: Keycloak owns users, passwords, the login session, brute-force protection and token issuing, and the platform's services only verify Keycloak's access tokens.

The login and registration pages stay "native": they are Keycloak's own pages, rendered with a **Keycloakify** theme that reproduces the app's design. Users can also **sign in with Google**, brokered by Keycloak.

The browser never holds a token. A small **backend-for-frontend** (`apps/bff`) is the only OAuth client: it runs the login with Keycloak, keeps the tokens server-side, gives the browser an `httpOnly` session cookie, and forwards API calls to the services with the access token attached (the "token handler" pattern recommended by the IETF's *OAuth 2.0 for Browser-Based Applications*).

Decided by the owner (2026-11-16), recorded as Q10–Q14 in `README.md`:

- **Q10:** `apps/auth` and `apps/user` are deleted. Settings uses Keycloak's application-initiated actions (update profile, update password, delete account), so those screens are Keycloakify pages too.
- **Q11:** tokens are kept by a BFF, never by the browser. This keeps the intent of Q2 (no token readable by script) and goes further: the access token leaves the browser too.
- **Q12:** start fresh. Accounts in the user service's `users` table are not migrated.
- **Q14:** an account deletion reaches the portfolio service through a Keycloak event listener publishing to Kafka, with a nightly cleanup as the safety net (K6).
- **Q13 (proposed, confirm in the phase):** the BFF is a full token handler that proxies API calls, not a "token-mediating" backend that hands the access token to the page (see K4 for the comparison).

Order: K1, K2, K3, K4, then K5. K1–K4 leave the running app unchanged (it still uses `apps/auth`), so they are safe on their own. K5 is the switch-over and must land whole. K6 (account events) belongs to phase 15, when there is data to clean up.

```
browser ──cookie──> Vite proxy / prod reverse proxy (Q9)
                      ├── /bff/*, /quotes/*, /stream, /portfolio/* ──> apps/bff :3005 ──Bearer──> sse-service, portfolio
                      └── /realms/*, /resources/*                  ──> Keycloak :8180
apps/bff ──code exchange, refresh, revoke──> Keycloak
Keycloak ──back-channel logout──> apps/bff
```

---

## K1 · Keycloak in the stack, with the realm as code — score 67

**Problem.** There is no identity provider. A realm configured by hand in the admin console cannot be reviewed, reproduced on a fresh clone, or rebuilt after `docker compose down -v`.

**Plan.**

1. Add a `keycloak` service to `docker-compose.yml`: `quay.io/keycloak/keycloak` pinned to a 26.x tag (check the current one), `start-dev --import-realm`, host port **8180**, on `stock-net`. Bootstrap admin from `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` in `.env.local`. Add `extra_hosts: ["host.docker.internal:host-gateway"]` so Keycloak can reach the BFF on the host for back-channel logout (K4).
2. Storage: a `keycloak` database in the existing Postgres container. The Postgres volume already exists, so an init script would never run; `scripts/dev.sh` creates the database if it is missing, idempotent like the rest of its setup.
3. Realm as code: `infra/keycloak/realm-stock-platform.json`, mounted at `/opt/keycloak/data/import`. It holds:
   - realm `stock-platform`, `registrationAllowed: true`, `registrationEmailAsUsername: true`, `loginWithEmailAllowed: true`, `duplicateEmailsAllowed: false`, `rememberMe: false`
   - password policy `length(8) and maxLength(128)`, the rules of the deleted `createUserBodySchema`
   - brute-force detection on, replacing the Redis login limits of phase 10: 5 failures, then a temporary lockout of 15 minutes; check the current attribute names
   - token lifetimes: access token 600 s; SSO session idle and max 7 days (the old refresh TTL; no "remember me")
   - client `stock-bff`: **confidential**, standard flow only (no implicit, no direct access grants, no service account), PKCE S256 required as well, secret from `${env.KC_BFF_CLIENT_SECRET}`, redirect URI `http://localhost:5173/bff/callback`, post-logout redirect `http://localhost:5173/*`, back-channel logout URL `http://host.docker.internal:3005/bff/backchannel-logout` with "session required" on
   - an audience mapper on that client that adds `stock-platform` to the access token's `aud`, so `JWT_AUDIENCE` keeps its value
   - the `delete_account` required action enabled, and the `delete-account` role of the `account` client in the default roles
   - user events saved (with an expiration, for example 7 days) for at least `DELETE_ACCOUNT`, so K6 has something to read
   - user profile: one **Name** field, matching the current register form (see the phase brief)
4. One origin: the browser reaches Keycloak through the Vite dev proxy at `/realms` and `/resources` → `http://localhost:8180`. Set `KC_HOSTNAME=http://localhost:5173`, so the issuer is `http://localhost:5173/realms/stock-platform` however Keycloak is reached, and every redirect Keycloak builds points at the app's origin.
5. `scripts/dev.sh`: generate `KC_BFF_CLIENT_SECRET` into `.env.local` (like `INTERNAL_API_TOKEN` today) and pass it to the Keycloak container; start and wait for Keycloak (`/health/ready` on the management port 9000, with `KC_HEALTH_ENABLED=true`); list it in the printed URLs; add a `--reset-realm` option that deletes and reimports the realm.

**Edge cases.**

- `--import-realm` skips a realm that already exists. Editing the JSON changes nothing on a running stack until `--reset-realm`; say so in the file's header and in `dev.sh` output. A regenerated client secret also needs a reimport.
- An export from the admin console contains generated ids, keys and secrets. Keep the JSON hand-written and minimal; never commit a secret.
- The issuer is the public URL, while the BFF and the services reach Keycloak at the internal one (`http://localhost:8180`). They differ on purpose: configure "issuer" and "where to fetch keys / call the token endpoint" separately.
- Keycloak takes 20–40 s to start; `dev.sh` must wait for readiness before starting the BFF, or OIDC discovery fails at its startup.
- Keycloak must never run in `stockdb`.

**Future issues.**

- `start-dev` is not for production: production needs `start` with an optimised build, TLS and a real hostname, behind the Q9 reverse proxy.
- Realm changes after launch need a migration story; keycloak-config-cli applies a JSON to an existing realm instead of reimporting.
- Keycloak's database needs backups like `stockdb`.

**Done when.** On a fresh clone, `pnpm dev:setup` brings Keycloak up with the `stock-platform` realm, and `http://localhost:5173/realms/stock-platform/.well-known/openid-configuration` (through the Vite proxy) shows the `localhost:5173` issuer.

---

## K2 · Keycloakify theme in the app's design — score 69

**Problem.** Keycloak's default login pages look nothing like the app. Every user passes through them, so they are the first thing anyone sees.

**Plan.**

1. New workspace app `apps/keycloak-theme`, set up as Keycloakify's monorepo subproject (Vite + React, the "pnpm workspaces / Turborepo" guide). Check the current Keycloakify major version and its guide before starting.
2. Shared design: move `tokens.css` and the two font files into a small package (`packages/design-tokens`), imported by both the frontend and the theme. Do not copy them: two copies drift.
3. Pages, in the design the owner approved in phase 10 (centred card on the page background, app name above it, `pageStyles.ts` classes):
   - `login.ftl`: email, password, "Log in", link to register, the Google button (K3)
   - `register.ftl`: email, name, password, confirm password; the only hint is "At least 8 characters"
   - the shared `Template` (card, app name, message banner), so every page Keycloak can show, including the ones not ejected (errors, info, "page expired", logout confirmation), sits in the same card
   - the pages K3 and K5 reach: `login-update-profile`, `login-update-password`, `delete-account-confirm`, `idp-review-user-profile`, `login-idp-link-confirm`
4. Copy follows phase 10's: "Invalid email or password", a lockout message, and "There is no password reset yet. Keep your password somewhere safe." (unless the owner turns reset on, see the phase brief).
5. Accessibility as in phase 10: labels, `autocomplete` (`username`, `current-password`, `new-password`), `aria-invalid` and `aria-describedby` on field errors, visible focus, no horizontal scroll at 360 px, axe clean.
6. Storybook holds every page in its error states: wrong password, locked out, email taken, password too short, passwords not matching.
7. Build: `build-keycloak-theme` writes the JAR into `apps/keycloak-theme/dist_keycloak`. Compose mounts the JAR for Keycloak 26 into `/opt/keycloak/providers`; the realm sets `loginTheme`.

**Edge cases.**

- Building the JAR needs **Maven** and a JDK. `dev.sh` checks for `mvn` and says how to install it. A Docker build stage is the alternative.
- Keycloak loads providers at startup: after rebuilding the JAR, restart Keycloak. For fast work on the pages use Storybook or `keycloakify start-keycloak`.
- Keycloak renders these pages, not Vite: no React Router, no API client, no app session. Everything comes from Keycloak's `kcContext`.
- Override the message bundles the design changes, in English only, and keep error texts from revealing whether an email is registered.
- Fonts ship inside the JAR; nothing loads from a CDN.
- Check the "page has expired" and "already logged in" pages, which the back button reaches easily.

**Future issues.**

- Keycloak upgrades can change `kcContext`; upgrade Keycloakify with Keycloak and rerun the Storybook review.
- Email templates need theming once SMTP exists.

**Done when.** In the compose Keycloak, the login, register, error and update-password pages look like the phase 10 pages at 360×740 and 1440×900 and are axe clean, and every Storybook error state was looked at.

---

## K3 · Sign in with Google — score 68

**Problem.** Registering with email and password is a barrier for a demo; a Google button is the expected shortcut.

**Plan.**

1. Identity provider `google` in the realm JSON, `clientId` and `clientSecret` from `${env.GOOGLE_CLIENT_ID}` / `${env.GOOGLE_CLIENT_SECRET}`, filled from `.env.local`. The secret is never committed; the example env file documents both and the Google Cloud console steps.
2. Google OAuth client (the owner creates it): "Web application", authorised redirect URI `http://localhost:5173/realms/stock-platform/broker/google/endpoint`. It follows `KC_HOSTNAME`, not port 8180.
3. `trustEmail: true`, `syncMode: IMPORT`, default first-broker-login flow, scopes `openid email profile`. Google's name fills the Name field.
4. The theme's login and register pages show "Continue with Google" from `kcContext.social.providers` (no hard-coded URL). The BFF's login endpoint also accepts `idp=google` and passes `kc_idp_hint=google`, so a "Continue with Google" button outside Keycloak can skip the login page.

**Edge cases.**

- No Google credentials: the button must not appear and Keycloak must still start. Decide in the phase whether `dev.sh` disables the provider or the theme hides an unconfigured one.
- Same email already registered with a password: the first-broker-login flow asks to link. Without SMTP, Keycloak asks for the existing password (`login-idp-link-confirm`). Theme it and test it.
- A Google user has no password; "Change password" in Settings sets one through `UPDATE_PASSWORD`. The copy must work for "set" too.
- The link is by Google's subject, not the email; an email change in the app keeps it.
- Google only accepts `localhost` or HTTPS redirect URIs; production needs its own entry. A consent screen in "Testing" mode only admits listed test users.

**Future issues.**

- Other providers are one realm entry plus a button each.
- Production needs Google's consent-screen verification.

**Done when.** With credentials set, a new Google account lands on the dashboard after one consent, a second visit logs straight in, and an email already registered with a password can be linked by entering that password. Without credentials, no Google button shows and nothing errors.

---

## K4 · Backend-for-frontend (`apps/bff`) — score 51

**Problem.** A token in the browser can be stolen by any script that runs on the page (XSS), and a refresh token stolen that way works for days. The hand-written auth avoided that for the refresh token with an `httpOnly` cookie (Q2). With Keycloak the same protection needs a confidential client on the server.

**Two ways to build it.** *(Q13: the first is recommended; confirm with the owner.)*

| | **Token handler (recommended)** | Token-mediating backend |
|---|---|---|
| What the browser holds | Only an `httpOnly` session cookie | The cookie, plus the access token in memory |
| API calls | Go to the BFF, which adds `Authorization: Bearer` and forwards them | Go straight to the services with the token |
| Frontend auth code | Almost none: `fetch` with the cookie; `401` means "go to login" | Today's `session.ts`, single-flight refresh, Web Locks and proactive refresh stay |
| Cost | Every API request and the stream pass through one more hop | A stolen access token works for up to 10 minutes |

The token handler is what "forget about auth handling" asks for: the frontend loses its token code entirely, and tabs share one session through the cookie, so the phase 10 Web Locks coordination is not needed at all.

**Plan.** *(Token handler.)*

1. New app `apps/bff`, Fastify, on port **3005** (freed by `apps/auth`), with the structure of the other services: config, routes, services, repositories, health. OIDC with **openid-client** (v6, by the author of `jose`): discovery against the internal Keycloak URL, Authorization Code with PKCE and `state` and `nonce`, refresh, token revocation, end-session URL. Check its current API before writing code.
2. Sessions in Redis: `bff:session:<id>` holds `{ sub, sid, name, email, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt, idToken }`, with a TTL of the refresh token's lifetime. `<id>` is 32 random bytes, base64url. Index keys `bff:user-sessions:<sub>` and `bff:sid:<sid>` let back-channel logout find a user's sessions.
3. Cookies:
   - `session`: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in production, named `__Host-session` there
   - `login`: short-lived (10 minutes) and `SameSite=Lax`, `Path=/bff/callback`, holding the signed `state`, `nonce`, PKCE verifier and return path. It must be `Lax`: the callback arrives as a cross-site navigation from Keycloak or Google, and a `Strict` cookie would not be sent on it
4. Routes:
   - `GET /bff/login?returnTo=<path>&prompt=create|&idp=google|&action=…`: sets the `login` cookie and redirects to Keycloak's authorise endpoint (public URL). `prompt=create` opens registration, `idp=google` adds `kc_idp_hint`, `action` is an allow-list of `UPDATE_PROFILE`, `UPDATE_PASSWORD`, `delete_account` sent as `kc_action` (Settings, K5). `returnTo` is validated as a same-origin path (`redirect.ts`'s rules move here).
   - `GET /bff/callback`: checks `state`, exchanges the code with the client secret, verifies the ID token, creates the session with a **new** id (no session fixation), clears the `login` cookie, redirects to `returnTo`. An `error` from Keycloak (the user cancelled an action, `kc_action_status=cancelled`) redirects back to `returnTo` without changing the session.
   - `GET /bff/me`: `{ user: { id, name, email } }` or `401`. The frontend's startup check, replacing `/auth/refresh`.
   - `POST /bff/logout` (needs `X-Requested-With: fetch`): deletes the session, revokes the refresh token at Keycloak, clears the cookie, and answers with Keycloak's end-session URL (`id_token_hint`, `post_logout_redirect_uri`). The page navigates there, so the Keycloak SSO session ends too; without that, the next login would succeed silently.
   - `POST /bff/backchannel-logout`: Keycloak's server-to-server call when a session ends elsewhere (account console, admin, password change, account deletion that ends the sessions). Verify the logout token (signature against Keycloak's keys, `iss`, `aud` = `stock-bff`, the back-channel `events` claim, no `nonce`), then delete the sessions by `sid`, or all of the user's by `sub`.
   - Proxy: `/quotes/*`, `/stream` and later `/portfolio/*`. Look up the session (`401` without one), refresh the access token if it expires within 30 s, forward with `Authorization: Bearer`, stream the response back. Use `@fastify/reply-from` or `@fastify/http-proxy` with timeouts off for the stream.
5. Refresh: one refresh per session at a time. Inside one BFF process, a map of in-flight refresh promises by session id. Leave Keycloak's "revoke refresh token" (rotation) **off** at first, so two BFF instances refreshing at once cannot log a user out; turn it on later together with a Redis lock.
6. CSRF: the `SameSite=Strict` session cookie, plus `X-Requested-With: fetch` required on every non-`GET` request through the BFF (the phase 10 rule, now in one place).
7. The services keep verifying the token themselves (the guard from phase 10, with Keycloak's keys). The BFF is not a trust boundary they rely on.

**Edge cases.**

- **The stream:** the SSE service still closes a stream at the access token's `exp` with `session-expired`. The client reconnects at once as today; the BFF refreshes on that new request. The proxy must pass the event through unbuffered and close the browser side when upstream closes (the Vite proxy needed the same fix).
- The refresh token expired or was revoked: the refresh fails, so the BFF deletes the session and answers `401`; the client goes to login with the current path.
- Keycloak unreachable: `/bff/me` answers `503`, not `401`, so the splash shows "Service unavailable, try again" instead of the login page (phase 10's rule). A proxied request whose token is still valid keeps working while Keycloak is down.
- Back-channel logout from a container to the host: on Linux `host.docker.internal` needs the `host-gateway` entry from K1. Once the BFF runs in compose, the URL becomes `http://bff:3005/...`.
- Redis down: no session can be read, so every request is `503`, as login fails closed today.
- The tokens sit in Redis in plain text. Anyone who can read Redis has them. Encrypting the session value (AES-GCM, key from env) is cheap; decide in the phase.
- `__Host-` cookies need `Secure`; on `http://localhost` in development, use the plain `session` name.
- Many tabs share one cookie and one session: logging out in one tab logs out all, and a refresh happens once for all of them.

**Future issues.**

- A session list ("log out other devices") is a scan of `bff:user-sessions:<sub>` plus Keycloak's own session list.
- Horizontal scaling: sessions are already in Redis; only the in-process refresh map needs to become a Redis lock.
- The BFF is the natural place for per-user rate limits on API calls.

**Done when.** Logging in through `/bff/login` leaves only the `session` cookie in the browser (nothing in storage, no token in any response body), `/quotes/*` and `/stream` work through the BFF, a token expiry mid-stream reconnects without a banner, ending the session in Keycloak's admin console logs the browser out on its next request, and the logout ends the Keycloak SSO session.

---

## K5 · Switch the app over and delete the hand-written auth — score 49

**Problem.** Once Keycloak and the BFF work, `apps/auth`, `apps/user`, the frontend's token code, the rate limiters, the internal token and the hand-written login and register pages are dead weight that still has to be secured.

**Plan.** *(Needs K1–K4.)*

1. Services: `createJwtGuard` (`packages/auth-guard`) verifies Keycloak tokens. Accept `RS256` (Keycloak's default signing key) instead of only `ES256`; the issuer is the `KC_HOSTNAME` URL; keys come from the internal certs URL. The SSE service config gets `JWKS_URL` in place of `AUTH_SERVICE_URL`. `sub` is the Keycloak user id (a UUID), so `authUserId` and the stream's expiry close work unchanged.
2. Frontend: delete `auth/session.ts`, `authApi.ts`, `credentials.ts`, the token and refresh parts of `tabSync.ts`, and the refresh logic in `api/client.ts`. `apiFetch` becomes `fetch` with `credentials: "same-origin"` and `X-Requested-With: fetch`; a `401` means logged out. `AuthProvider` calls `/bff/me` at startup (the splash stays); the user in the shell comes from it.
3. Pages: delete `LoginPage`, `RegisterPage`, `authForm.tsx` and `AuthCard`. The route guard sends a missing session to `/bff/login?returnTo=<path>`. `/login` and `/register` remain as routes that only redirect to `/bff/login` and `/bff/login?prompt=create`, so old links still work.
4. Logout: `POST /bff/logout`, then navigate to the end-session URL it returns. Keep the `BroadcastChannel("auth")` logout message so other tabs leave at once.
5. Settings (Q10): Profile, Password and Danger zone become a short description and a button each, linking to `/bff/login?action=UPDATE_PROFILE&returnTo=/settings` (and `UPDATE_PASSWORD`, `delete_account`). After an action the BFF's callback refreshes the session, so the shell shows the new name at once. After a delete, Keycloak ends the session and the page lands on login. Delete `api/account.ts` and the field validation that mirrored the user service.
6. Delete `apps/auth`, `apps/user`, `createInternalGuard`, `INTERNAL_TOKEN_HEADER`, the login and registration rate limiters, and `FixedWindowCounter` if nothing else uses it. Remove `JWT_PRIVATE_KEY`, `INTERNAL_API_TOKEN` and the user service's settings from `.env.local.example` and `dev.sh`. The Vite proxy sends `/bff`, `/quotes` and `/stream` to the BFF and `/realms`, `/resources` to Keycloak; nothing goes to the SSE service directly any more.
7. Data (Q12): drop the `users` table from `stockdb` once, with a note in `dev.sh` output. Leftover `auth:*` and `ratelimit:*` keys in Redis expire on their own.
8. Docs: in `docs/openapi.yaml` replace the auth, user and internal paths with the `/bff/*` routes, describe cookie authentication for the proxied paths, and update `scripts/api-docs.mjs` to proxy through the BFF. Write an ADR for Q10–Q13, including what was given up.

**Edge cases.**

- The callback after an action must refresh the stored user (`name`, `email`) from the new ID token, or the shell shows the old name until the next login.
- `delete_account` only works for users with the `delete-account` role; the realm JSON must have it from the first import.
- Tests: the Vitest suites for removed modules go with them; the event-stream parser stays, and the redirect validation tests move to the BFF with the code. Add BFF tests for the callback (`state` mismatch, replayed code, bad `returnTo`) and the back-channel logout token checks.
- Check once with a short access-token lifespan in the realm: the stream's `session-expired` path through the BFF.

**Future issues.**

- Roles (foreseen in A1) become realm roles in the token's `realm_access.roles`; the guard can expose them next to `authUserId`, and the BFF can show them in `/bff/me`.
- Email verification and password reset become a realm setting plus SMTP (Mailpit in dev), with no code.

**Done when.** `apps/auth` and `apps/user` are gone and `pnpm build` passes. A new user can register (or use Google), land on the requested page, reload without logging in again, stay logged in past the access-token lifetime with the stream live, change their name and password and delete their account from Settings, and log out in one tab and see the other follow. No token is ever visible to the page. `curl /quotes/AAPL/snapshot` without a cookie is `401`.

---

## K6 · Account events to the platform — score 51 (with phase 15)

**Problem.** When a user deletes their account in Keycloak, the portfolio service (phase 15) must delete their watchlist, alerts and trades. Keycloak is not silent about it, but it does not call anyone over HTTP out of the box:

- Every user action raises an **event** (`REGISTER`, `LOGIN`, `UPDATE_PROFILE`, `DELETE_ACCOUNT`, …), and every admin change an **admin event** (for example `DELETE` on a user). Events go to the realm's **event listeners**, Java plug-ins that run inside Keycloak; the built-in ones only log or send email.
- Events can also be **saved** and read back through the Admin REST API (`GET /admin/realms/{realm}/events?type=DELETE_ACCOUNT`).
- **Back-channel logout** (K4) tells the BFF when sessions end, but it says nothing about why, so it cannot tell a deletion from a logout.

So "notify another service" means adding a listener, or reading the saved events.

**Decided by the owner (2026-11-16, Q14): a Kafka event listener for speed, plus a nightly cleanup as the safety net.** The alternatives considered:

| Option | How | Why not alone |
|---|---|---|
| **Kafka event listener (chosen)** | A small Keycloak plug-in publishes deletions to Kafka | A deletion during a broker outage can be lost; hence the nightly job |
| **Nightly cleanup (chosen, as the safety net)** | A job deletes rows of users Keycloak no longer has | Data lingers up to a day |
| Webhook extension | A community plug-in posts events over HTTP | Third-party code tied to Keycloak versions; the receiver must be up |
| Poll saved events | The portfolio service reads `DELETE_ACCOUNT` events every minute | Up to a minute late; expired events are missed; needs admin permissions |

**Plan.** *(Phase 15, after P1's tables exist.)*

1. **Listener.** New Maven module `infra/keycloak/event-listener`: an `EventListenerProvider` and its factory (id `stock-kafka`), about 100 lines of Java, built to a JAR mounted into `/opt/keycloak/providers` next to the theme. Check the current Keycloak SPI docs and the `kafka-clients` version against Keycloak 26's Java before writing it.
   - It reacts to two things: the user event `DELETE_ACCOUNT` (the user deleted themselves through the Settings action) and the admin event `DELETE` on resource type `USER` (an admin deleted them).
   - It publishes `{ "type": "user.deleted", "userId": "<sub>", "occurredAt": <epoch ms>, "source": "self" | "admin" }` to the topic **`identity.events`**, keyed by the user id. Nothing else: no email, no name.
   - The broker address and topic come from Keycloak's SPI config (`--spi-events-listener--stock-kafka--bootstrap-servers=…`), set in compose; `redpanda:9092` inside `stock-net`.
   - The realm JSON adds `stock-kafka` to `eventsListeners` (next to `jboss-logging`) and turns admin events on.
   - The send is asynchronous with a few retries and a short timeout, so a slow broker never blocks a user's deletion. A send that still fails is logged with the user id at `ERROR`; the nightly job (step 3) repairs it.
2. **Consumer.** The portfolio service consumes `identity.events` with its own consumer group (`portfolio-identity`), with `packages/kafka` as the consumer app does. On `user.deleted` it deletes the user's rows from every table in one transaction. Deleting rows that are already gone is a no-op, so a redelivered or replayed event changes nothing.
3. **Nightly cleanup.** A job in the portfolio service, once a day (and on demand through a script for testing): collect the distinct `user_id`s across its tables, ask Keycloak which still exist, and delete the rest.
   - It uses a confidential client `stock-portfolio` with a **service account** that has only the `realm-management` role `view-users`. Its secret is generated by `dev.sh` like `KC_BFF_CLIENT_SECRET`.
   - Lookups go one by one (`GET /admin/realms/stock-platform/users/{id}`; `404` means gone), in small batches. Any other error (Keycloak down, `5xx`) aborts the run without deleting anything: never treat "could not check" as "deleted".
   - It logs how many users it removed; a non-zero count means the listener missed something, which is worth a look.
4. `scripts/dev.sh` creates the `identity.events` topic like `stock-prices`, and builds the listener JAR with the theme (both need Maven).

**Edge cases.**

- A user who deletes their account and registers again with the same email gets a **new** `sub`, so the old rows are never mistaken for theirs.
- The event can arrive before the user's last write lands (a trade in flight while they delete). The nightly job removes such a straggler; a stricter fix would be the portfolio service rejecting writes for unknown users, which is not needed now.
- Keycloak fires the listener inside its own request; an exception thrown from the listener must never escape, or it could break the deletion page. Catch everything.
- Topic retention: `identity.events` should keep events longer than the portfolio service could plausibly be down (for example 7 days), unlike the short retention planned for `stock-prices` (phase 19).
- The listener JAR and the theme JAR are both loaded at Keycloak startup; a broken listener stops Keycloak from starting. Test the JAR in compose, not only in a unit test.

**Future issues.**

- Other services that keep per-user data later (notifications, exports) subscribe to the same topic with their own consumer group; nothing changes in Keycloak.
- The same listener can publish `user.registered` or `user.updated` when something needs them.
- For guaranteed delivery without the nightly job, Keycloak would need a transactional outbox, which it does not offer; the nightly job is the standard answer.

**Done when.** (Phase 15.) Deleting an account through Settings removes that user's portfolio rows within a few seconds; deleting a user in the admin console does the same; with Redpanda stopped during a deletion, Keycloak still deletes the account and the next cleanup run removes the rows; a replayed event changes nothing; and with Keycloak stopped, the cleanup run deletes nothing.
