# Phase 12 · Keycloak and the BFF, one commit per session

Paste this line into a fresh chat: **Read roadmap/PHASE-12-COMMITS.md and follow it.**
To do a specific commit instead of the next one, add its number: "…and follow it for commit 7."

This file breaks phase 12 (K1–K5 in `08-identity.md`) into 31 commits. Each session does **one** commit. For phase 12, the rules below replace `PROMPT.md`'s branch, commit, push and pull-request steps. Its other rules still apply: the plans are final, ask the owner where the brief says so, check current docs, and verify for real.

## Rules for every session

### 1. Find your commit
1. Your commit is the first row in the table below whose status is not `done`, unless the owner named a number.
2. Read this file, including "Decisions" and "Notes between commits". Then read the `08-identity.md` section for your commit's K item, the phase 12 brief in `PHASES.md`, and the code you are about to change.

### 2. Confirm the previous commit was done
1. Run `git status` and `git log --oneline -5`.
2. The previous row must be `done`, and a commit with its subject must be in `git log` (not necessarily the latest: docs commits may come after it). If it is not there, stop and tell the owner.
3. The working tree must be clean, apart from `apps/frontend/tsconfig.app.tsbuildinfo` (see the notes). Uncommitted work means the previous commit is not finished: stop and ask the owner. Do not commit, stash or discard it.

### 3. Implement
- Work on `master`. No branches, no commits, no pushes, no pull requests: the owner reviews and commits.
- Do only your commit's scope. Note anything outside it in "Notes between commits" instead of doing it.
- If a step depends on an open owner question (see "Decisions"), ask before writing that code.
- Check the current docs for any library or Keycloak feature you use.
- Run `pnpm build` when TypeScript changed, and test the change for real (compose, curl, browser). Say plainly what you could not test.
- Restore `apps/frontend/tsconfig.app.tsbuildinfo` with `git checkout --` if a build changed it and your commit did not mean to.

### 4. Finish
1. Set your row's status to `done` in the table, and record any decision the owner made in "Decisions".
2. Append a dated entry under "Notes between commits" for anything later commits need that this file does not say.
3. Report: what changed, what you tested and how, what you could not test, anything left open.
4. End with the commit message in a code block. The subject is the one in the table (adjusted only if the scope changed). The body says what changed and why, in short lines.

## The commits

Status: `todo` or `done`. The K1–K4 commits leave the running app unchanged. K5 lands as a whole; the app only switches over in commit 27.

| # | K | Subject | Scope | Status |
|---|---|---|---|---|
| 1 | K1 | `chore(infra): add the keycloak service to compose` | Pinned 26.x image, `start-dev --import-realm`, port 8180, `KC_HOSTNAME`, `KC_HEALTH_ENABLED`, `extra_hosts` host-gateway, DB settings for a `keycloak` database | done |
| 2 | K1 | `chore(scripts): create the keycloak database and the client secret in dev.sh` | DB if missing, `KC_BFF_CLIENT_SECRET`, wait for readiness, `--reset-realm`, printed URL, `.env.local.example` | done |
| 3 | K1 | `feat(infra): add the stock-platform realm` | Realm settings, password policy, brute force, token lifetimes, one-field user profile, import mount | done |
| 4 | K1 | `feat(infra): add the stock-bff client to the realm` | Confidential client, standard flow only, PKCE S256, redirect, post-logout and back-channel URLs, audience mapper (`stock-platform`), `delete_account` action and role in the default roles, saved events including `DELETE_ACCOUNT` | todo |
| 5 | K1 | `chore(frontend): proxy /realms and /resources to keycloak` | Vite proxy. Done when: `http://localhost:5173/realms/stock-platform/.well-known/openid-configuration` shows the 5173 issuer | todo |
| 6 | K2 | `refactor: move the design tokens and fonts into packages/design-tokens` | The frontend imports them; no visual change | todo |
| 7 | K2 | `chore: scaffold apps/keycloak-theme with Keycloakify` | Vite, React, Storybook, turbo wiring (the monorepo guide of the current Keycloakify major) | todo |
| 8 | K2 | `feat(theme): add the shared Template and message overrides` | Card, app name, message banner, English copy | todo |
| 9 | K2 | `feat(theme): add the login page` | Email, password, "Log in", link to register | todo |
| 10 | K2 | `feat(theme): add the register page` | Email, name, password, confirm password | todo |
| 11 | K2 | `feat(theme): add the action and broker pages` | `login-update-profile`, `login-update-password`, `delete-account-confirm`, `idp-review-user-profile`, `login-idp-link-confirm` | todo |
| 12 | K2 | `test(theme): add Storybook error states for every page` | Wrong password, locked out, email taken, password too short, passwords not matching | todo |
| 13 | K2 | `chore(infra): build the theme JAR, mount it and set loginTheme` | `build-keycloak-theme`, compose mount into `/opt/keycloak/providers`, realm `loginTheme`, `mvn` check in `dev.sh` | todo |
| 14 | K3 | `feat(infra): add the google identity provider to the realm` | Secrets from env, the chosen behaviour without credentials, `.env.local.example` docs | todo |
| 15 | K3 | `feat(theme): add "Continue with Google" from kcContext.social.providers` | Login and register pages | todo |
| 16 | K4 | `chore(bff): scaffold apps/bff` | Fastify, config with separate issuer and internal Keycloak URLs, health, logger | todo |
| 17 | K4 | `feat(bff): add OIDC discovery with openid-client` | Discovery against the internal URL | todo |
| 18 | K4 | `feat(bff): add the Redis session store` | `bff:session:*`, `bff:user-sessions:<sub>`, `bff:sid:<sid>`, encryption if chosen | todo |
| 19 | K4 | `feat(bff): add GET /bff/login and the login cookie` | `returnTo` validation copied from `redirect.ts` with its tests, `prompt`, `idp`, `action` allow-list | todo |
| 20 | K4 | `feat(bff): add GET /bff/callback` | `state` and `nonce`, code exchange, new session id, `error` and cancelled action | todo |
| 21 | K4 | `feat(bff): add GET /bff/me` | `401` without a session, `503` when Keycloak is down | todo |
| 22 | K4 | `feat(bff): add single-flight token refresh` | Refresh within 30 s of expiry, one per session at a time | todo |
| 23 | K4 | `feat(bff): proxy /quotes and /stream with the bearer token` | Unbuffered stream, timeouts off, `X-Requested-With` on non-GET | todo |
| 24 | K4 | `feat(bff): add POST /bff/logout` | Delete the session, revoke the refresh token, return the end-session URL | todo |
| 25 | K4 | `feat(bff): add POST /bff/backchannel-logout` | Verify the logout token, delete by `sid` or `sub`. Then run K4's "Done when" | todo |
| 26 | K5 | `feat(auth-guard): accept RS256 and a configurable JWKS URL` | SSE service `AUTH_SERVICE_URL` → `JWKS_URL`; both algorithms, so the old login keeps working | todo |
| 27 | K5 | `feat(frontend): switch authentication to the BFF` | `apiFetch` → `fetch`, `AuthProvider` on `/bff/me`, guard → `/bff/login`, logout through the BFF, Vite proxy and `dev.sh` env, `/login` and `/register` as redirects | todo |
| 28 | K5 | `feat(frontend): use keycloak actions on the settings page` | Buttons for `UPDATE_PROFILE`, `UPDATE_PASSWORD`, `delete_account`; the callback refreshes name and email | todo |
| 29 | K5 | `refactor(frontend): delete the hand-written auth code` | `session.ts`, `authApi.ts`, `credentials.ts`, token parts of `tabSync`, old pages, `AuthCard`, `api/account.ts` | todo |
| 30 | K5 | `chore: delete apps/auth and apps/user` | Internal guard, rate limiters, `JWT_PRIVATE_KEY`, `INTERNAL_API_TOKEN`, `dev.sh` blocks, drop the `users` table | todo |
| 31 | K5 | `docs: document the /bff routes and add the ADR for Q10–Q13` | `openapi.yaml`, `api-docs.mjs`, ADR, phase 12 notes in `PHASES.md` and its status set to `done`. Then run K5's "Done when" | todo |

K6 (the Kafka event listener) is phase 15, not part of this file.

## Decisions

Made by the owner during phase 12:

- **2026-11-18, name field:** one "Name" field: Keycloak's `firstName` labelled "Name", `lastName` removed from the user profile.
- **2026-11-18, password reset:** off, as before (no SMTP). The login page keeps "There is no password reset yet. Keep your password somewhere safe."
- **2026-11-18, workflow:** work on `master`, one commit per session, the owner commits (this file's rules).

Still open. Ask before the commit named:

| Question | Before commit | Recommended |
|---|---|---|
| Port 3005: the BFF's planned port is still used by `apps/auth` until commit 30, and the back-channel URL in commit 4 points at it | 4 | Give the BFF a temporary port (for example 3007) in the realm and its config until K5, then move it to 3005 |
| Q13: token handler or token-mediating backend | 16 | Token handler |
| Encrypt the session value in Redis (AES-GCM, key from env) | 18 | Owner's call; cheap to add |
| Design reference for the theme: the phase 10 pages or a separate mock-up | 8 | The phase 10 pages |
| Maven and a JDK installed locally, or a Docker build stage | 13 | Local install |
| Google button position, and hide it or disable the provider without credentials | 14 | Above the form with an "or" divider; hide when unconfigured |

## Notes between commits

### After commits 1–3 (2026-11-18)
- Image `quay.io/keycloak/keycloak:26.8.1`. 26.8.2 was 6 days old at the time; move up after it has aged.
- URLs: `KC_HOSTNAME=http://localhost:5173` (issuer and browser URLs), `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` (token and JWKS endpoints follow the request, so `http://localhost:8180` works for the BFF and the services), `KC_HOSTNAME_ADMIN=http://localhost:8180` (the admin console stays on 8180, since the Vite proxy only forwards `/realms` and `/resources`). Verified in the discovery document.
- The management port 9000 is not published; the compose healthcheck calls `/health/ready` with bash `/dev/tcp`, because the image has no curl.
- `dev.sh` starts Postgres, Redis and Redpanda first, creates the `keycloak` database, then starts Keycloak with `--wait` (up to 180 s). `--reset-realm` deletes the realm with `kcadm.sh` and recreates the container, so a new client secret reaches it.
- **Placeholder syntax:** Keycloak resolves `${NAME}` in the realm file, not `${env.NAME}` as `08-identity.md` writes it. Use `${KC_BFF_CLIENT_SECRET}` in commit 4. The `${username}` and `${email}` message keys in the user profile survived the import untouched.
- The realm JSON has no comments: the reasons for each setting are in `infra/keycloak/README.md`. Keep that table up to date when adding settings.
- Brute force: tested that a lockout happens. Rapid failures less than 1 s apart trigger Keycloak's 1-minute anti-automation lock after the second failure. The 5-failure, 15-minute path itself was not tested; it needs failures spaced more than 1 s apart.
- `pnpm build` rewrites the tracked `apps/frontend/tsconfig.app.tsbuildinfo`, and every `dev.sh` run builds. Restore it unless the commit changes the frontend.
- Quick admin access for checks: `docker exec stock-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin`, then `kcadm.sh get realms/stock-platform`.
