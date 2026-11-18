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
| 4 | K1 | `feat(infra): add the stock-bff client to the realm` | Confidential client, standard flow only, PKCE S256, redirect, post-logout and back-channel URLs, audience mapper (`stock-platform`), `delete_account` action and role in the default roles, saved events including `DELETE_ACCOUNT` | done |
| 5 | K1 | `chore(frontend): proxy /realms and /resources to keycloak` | Vite proxy. Done when: `http://localhost:5173/realms/stock-platform/.well-known/openid-configuration` shows the 5173 issuer | done |
| 6 | K2 | `refactor: move the design tokens and fonts into packages/design-tokens` | The frontend imports them; no visual change | done |
| 7 | K2 | `chore: scaffold apps/keycloak-theme with Keycloakify` | Vite, React, Storybook, turbo wiring (the monorepo guide of the current Keycloakify major) | done |
| 8 | K2 | `feat(theme): add the shared Template and message overrides` | Card, app name, message banner, English copy | done |
| 9 | K2 | `feat(theme): add the login page` | Email, password, "Log in", link to register | done |
| 10 | K2 | `feat(theme): add the register page` | Email, name, password, confirm password | done |
| 11 | K2 | `feat(theme): add the action and broker pages` | `login-update-profile`, `login-update-password`, `delete-account-confirm`, `idp-review-user-profile`, `login-idp-link-confirm` | done |
| 12 | K2 | `test(theme): add Storybook error states for every page` | Wrong password, locked out, email taken, password too short, passwords not matching | done |
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
- **2026-11-18, BFF port:** the BFF uses port **3007** until K5. The realm's back-channel URL is `http://host.docker.internal:3007/bff/backchannel-logout`, and commit 16's config defaults to 3007. When `apps/auth` is deleted (commit 30), move the BFF, the realm URL and the Vite proxy to 3005.
- **2026-11-18, theme design reference:** the phase 10 pages (`AuthCard`, `pageStyles.ts`), no separate mock-up.
- **2026-11-18, workflow:** work on `master`, one commit per session, the owner commits (this file's rules).

Still open. Ask before the commit named:

| Question | Before commit | Recommended |
|---|---|---|
| Q13: token handler or token-mediating backend | 16 | Token handler |
| Encrypt the session value in Redis (AES-GCM, key from env) | 18 | Owner's call; cheap to add |
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

### After commit 4 (2026-11-18)
- Listing `requiredActions` in the realm JSON **replaces** Keycloak's defaults rather than adding to them, and declaring `defaultRole` with composites needs the realm roles it contains (`offline_access`, `uma_authorization`) declared too, or the import fails. Both are in the file now; keep the full lists when editing.
- The access token's `aud` is `["stock-platform", "account"]` (the `account` part comes from the default `account` client roles). The guard in commit 26 must accept an array that contains `stock-platform`, not require an exact string.
- The client secret is not echoed by `kcadm get clients` field filters; compare it with `kcadm get clients/<id>/client-secret`. It matched `.env.local`.
- Tested with curl against 8180: the code flow with PKCE S256 gives tokens (issuer `http://localhost:5173/...`, 600 s access, ~7-day refresh, `sid` in the ID token, `name` = firstName). Without a code challenge Keycloak redirects with `invalid_request`; a foreign `redirect_uri` is `400`; password and client-credentials grants are `unauthorized_client`. An admin logout POSTed a logout token (`sid`, `sub`, `aud: stock-bff`) to a listener on host port 3007, so `host.docker.internal` works from the container.
- The login form's `action` points at `localhost:5173` (from `KC_HOSTNAME`); for curl tests before commit 5, rewrite it to 8180.
- Not tested: the `delete_account` action and a saved `DELETE_ACCOUNT` event (they need the confirm page; commit 28 tests them). `LOGIN` events were seen saved.
- `08-identity.md` still says 3005 for the BFF; it is the final port, so it was left as is. The temporary 3007 lives in the decision above.

### After commit 5 (2026-11-18)
- `/realms` and `/resources` go to `VITE_KEYCLOAK_URL` (default `http://localhost:8180`) with `changeOrigin: false`. Keep it off: with `KC_HOSTNAME_BACKCHANNEL_DYNAMIC` Keycloak builds the token, JWKS and other back-channel URLs from the `Host` header. Through 5173 the discovery document then lists 5173 for every endpoint, while on 8180 the token and JWKS URLs stay 8180 for the BFF. Both were checked.
- The curl workaround from commit 4 (rewriting the form `action` to 8180) is no longer needed. A full code flow with PKCE through 5173 works: the login page, its `/resources` CSS, the form post with Keycloak's cookies (path `/realms/stock-platform/`), and the 302 to `http://localhost:5173/bff/callback`. That route 404s until commit 20.
- No app route starts with `/realms` or `/resources`. Keep it that way, because the proxy catches any path with those prefixes.

### After commit 6 (2026-11-18)
- `packages/design-tokens` is CSS only (no build step): `tokens.css`, `fonts.css` (the two `@font-face` rules, relative urls) and `fonts/` with the WOFF2 files and OFL licences. Import with `@import "@stock-platform/design-tokens/tokens.css"` and `.../fonts.css`; add `"@stock-platform/design-tokens": "workspace:*"`.
- The fonts are now bundled and hashed by Vite instead of served from `public/fonts`, so `index.html` cannot name them. A small `preloadFonts` plugin in `apps/frontend/vite.config.ts` injects the preload links for the emitted `.woff2` files at build time (checked in `dist/index.html`). The dev server serves the fonts without preload, as before for any asset it does not know.
- For the theme (commit 7+): import the same two CSS files; Keycloakify's Vite build hashes the fonts into the JAR, so nothing loads from a CDN. `PHASES.md` line 240 still says `public/fonts`; left as history.

### After commit 7 (2026-11-18)
- `apps/keycloak-theme` is `@stock-platform/keycloak-theme`: Keycloakify 11.16.4, React 19, Storybook 10 (`@storybook/react-vite`), theme name `stock-platform`, login theme only (`accountThemeImplementation: "none"`), one JAR for Keycloak 25+. It is a copy of `keycloakify-starter` with the `!` in `main.tsx` replaced by a check. The files under `src/login/` are still the starter's: `KcPage` renders `DefaultPage` for every page until commits 8–11.
- `src/kc.gen.tsx` is generated by the Keycloakify vite plugin (`keycloakify update-kc-gen`) and committed, as the starter does. It has `@ts-nocheck`.
- The theme's `build` (`tsc && vite build`) runs in `pnpm build`; it needs no Maven. `build-keycloak-theme` (adds `keycloakify build`, which does need Maven) is a separate turbo task and a root script: `pnpm build-keycloak-theme`. `pnpm theme:storybook` starts Storybook on 6006. Maven is not installed on this machine, so the JAR step was not run (commit 13).
- The theme does not import `@stock-platform/design-tokens` yet; commit 8 adds the dependency and the two CSS imports.
- Storybook builds with no stories yet; stories arrive with the pages (commit 9+), using `createKcPageStory` from `src/login/KcPageStory.tsx`.
- The theme is not formatted with the starter's Prettier config (4 spaces); it follows the repo's 2-space style.

### After commit 8 (2026-11-18)
- `src/login/Template.tsx` is our own layout (card, `STREAMTICK` brand above, reset note below, message banner with `role="alert"` for errors and `status` otherwise). It keeps Keycloakify's `useInitialize` for the session-polling scripts. `KcPage` passes `doUseDefaultCss={false}`, so Patternfly is never loaded: only `src/login/theme.css` styles the pages (plain CSS on the shared tokens, `st-*` classes). Pages in commits 9–11 add their own `st-*` field and button classes there; the ones they render through `DefaultPage` fall back to the `classes` map in `KcPage.tsx` (still empty).
- The brand text comes from the realm `displayName` ("Streamtick"), shown upper-case by CSS; the frontend's `STREAMTICK` is literal.
- Message overrides are in `i18n.ts` (`withCustomTranslations`, English only). The custom key `noPasswordResetNote` is the footer note. Wrong email, wrong password and unknown user all say "Invalid email or password". The lockout and email-taken texts are first drafts: check them in the Storybook error states (commit 12).
- Not seen in a browser: no stories exist yet, so only `tsc` and `vite build` ran. First visual check is commit 9.

### After commit 9 (2026-11-18)
- `src/login/pages/Login.tsx` is our own page, wired in `KcPage.tsx`. One error for both fields (`role="alert"`, `aria-invalid` and `aria-describedby` on both inputs); the banner is hidden while it shows. No remember-me, reset link or passkeys. Commit 15 adds the Google button through the Template's `socialProvidersNode`; the page does not pass one yet.
- Shared form classes are in `theme.css` (`st-form`, `st-field`, `st-label`, `st-hint`, `st-input`, `st-error`, `st-button`). Commit 10 reuses them. Copy keys `loginAccountTitle`, `noAccount` and `createOneLink` ("Create one") are in `i18n.ts`; `doRegister` stays "Create account" for the register button.
- `src/login/pages/Login.stories.tsx` has a Default story (error states: commit 12). Checked in a headless Chrome screenshot of the built Storybook at 360×740: card, focus ring and note look like phase 10. The label there reads "Username or email" because the mock realm lacks `registrationEmailAsUsername`; the real realm shows "Email". Not tested: axe, the page in the compose Keycloak (commit 13).

### After commit 10 (2026-11-18)
- `pages/Register.tsx` wraps Keycloakify's stock `UserProfileFormFields` (the fields, validation and errors come from the realm's user profile) and styles it through the `classes` map in `KcPage.tsx` (`st-field`, `st-label`, `st-input`, `st-error`). Commits 11 (`login-update-profile`, `idp-review-user-profile`) get the same look from that map. Do not eject the field component unless something needs it.
- The stock fields show `*` after required labels, so the page also shows the "* Required fields" line. Phase 10 had neither. Left as is (accessible, and every field is required); drop it if the owner wants the phase 10 look exactly.
- The password hint "At least 8 characters" is in `AfterField`; an effect sets `aria-describedby` on the input, because the stock field cannot. Field errors are `aria-live` spans with `aria-invalid` on the input, not linked by `aria-describedby`. Check with axe in commit 12/13.
- The password reveal button is hidden (`st-reveal`), as phase 10 had none. Copy keys added: `registerTitle`, `haveAccountText`, `passwordHint`.
- Not verified: the field order and the "Name" label in the real realm. The Storybook mock profile (username, first and last name) differs from the realm (email, name only); check the compose Keycloak in commit 13, and mock the realm's attributes in commit 12's stories if possible.

### After commit 11 (2026-11-18)
- Five pages in `src/login/pages/`, wired in `KcPage.tsx`: `LoginUpdateProfile` and `IdpReviewUserProfile` (both thin wrappers over `ProfileForm.tsx`: the realm's profile fields, submit, and a cancel button when `isAppInitiatedAction`), `LoginUpdatePassword` (own markup, hint "At least 8 characters", `aria-invalid`/`aria-describedby` on both fields, the "log out other sessions" box kept, cancel for app-initiated actions), `DeleteAccountConfirm` (warning, danger button, cancel when `triggered_from_aia`), `LoginIdpLinkConfirm` (link account as the primary button, review profile as the secondary one).
- New classes in `theme.css`: `st-button-secondary`, `st-button-danger`, `st-text`, `st-list`, `st-check`. Each page has a Default story; error states are commit 12.
- The copy comes from Keycloak's English bundle, with no overrides yet. The `irreversibleAction` and `confirmLinkIdpContinue` texts were not reviewed in a browser.
- Only `tsc` and `pnpm build` ran. Storybook was not opened, so none of the five pages has been looked at or checked with axe yet (commit 12/13).

### After commit 12 (2026-11-18)
- `KcPageStory.tsx` now has `fieldErrors({ field: "text" })` (a `messagesPerField` for a failed submit) and `bannerError("text")` (a `message`), used in each story's `kcContext`. Its mock realm now matches ours: `registrationEmailAsUsername: true`, and on `register`, `login-update-profile` and `idp-review-user-profile` the profile has only `email` and `firstName` ("Name"), as the realm does. This also covers the open check from commit 10 (Name label); the real-realm field order is still for commit 13.
- Error stories: login (`WrongPassword`, `LockedOut`), register (`EmailTaken`, `PasswordTooShort`, `PasswordsDoNotMatch`), update-password (`PasswordTooShort`, `PasswordsDoNotMatch`), update-profile and idp-review (`EmailTaken`, `NameMissing`), delete-account-confirm and idp-link-confirm (`Failed`, a banner).
- The error texts in the stories are written by hand. "Invalid password: minimum length 8." and "Password confirmation doesn't match." are what Keycloak's English bundle says; compare them with the real realm in commit 13. Locked-out shows the banner text from `i18n.ts`; the real lock may come back as the same "Invalid email or password" (Keycloak hides the lock when `permanentLockout` is off and the user exists): check in commit 13.
- Seen in headless Chrome at 400 px: login (wrong password, locked out), register (email taken), update-password (mismatch). The other stories only built. axe was not run.
- On the register page Keycloak puts password and confirm between Email and Name.
