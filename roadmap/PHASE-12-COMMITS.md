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
| 13 | K2 | `chore(infra): build the theme JAR, mount it and set loginTheme` | `build-keycloak-theme`, compose mount into `/opt/keycloak/providers`, realm `loginTheme`, `mvn` check in `dev.sh` | done |
| 14 | K3 | `feat(infra): add the google identity provider to the realm` | Secrets from env, the chosen behaviour without credentials, `.env.local.example` docs | done |
| 15 | K3 | `feat(theme): add "Continue with Google" from kcContext.social.providers` | Login and register pages | done |
| 16 | K4 | `chore(bff): scaffold apps/bff` | Fastify, config with separate issuer and internal Keycloak URLs, health, logger | done |
| 17 | K4 | `feat(bff): add OIDC discovery with openid-client` | Discovery against the internal URL | done |
| 18 | K4 | `feat(bff): add the Redis session store` | `bff:session:*`, `bff:user-sessions:<sub>`, `bff:sid:<sid>`, encryption if chosen | done |
| 19 | K4 | `feat(bff): add GET /bff/login and the login cookie` | `returnTo` validation copied from `redirect.ts` with its tests, `prompt`, `idp`, `action` allow-list | done |
| 20 | K4 | `feat(bff): add GET /bff/callback` | `state` and `nonce`, code exchange, new session id, `error` and cancelled action | done |
| 21 | K4 | `feat(bff): add GET /bff/me` | `401` without a session, `503` when Keycloak is down | done |
| 22 | K4 | `feat(bff): add single-flight token refresh` | Refresh within 30 s of expiry, one per session at a time | done |
| 23 | K4 | `feat(bff): proxy /quotes and /stream with the bearer token` | Unbuffered stream, timeouts off, `X-Requested-With` on non-GET | done |
| 24 | K4 | `feat(bff): add POST /bff/logout` | Delete the session, revoke the refresh token, return the end-session URL | done |
| 25 | K4 | `feat(bff): add POST /bff/backchannel-logout` | Verify the logout token, delete by `sid` or `sub`. Then run K4's "Done when" | done |
| 26 | K5 | `feat(auth-guard): accept RS256 and a configurable JWKS URL` | SSE service `AUTH_SERVICE_URL` → `JWKS_URL`; both algorithms, so the old login keeps working | done |
| 27 | K5 | `feat(frontend): switch authentication to the BFF` | `apiFetch` → `fetch`, `AuthProvider` on `/bff/me`, guard → `/bff/login`, logout through the BFF, Vite proxy and `dev.sh` env, `/login` and `/register` as redirects | done |
| 28 | K5 | `feat(frontend): use keycloak actions on the settings page` | Buttons for `UPDATE_PROFILE`, `UPDATE_PASSWORD`, `delete_account`; the callback refreshes name and email | done |
| 29 | K5 | `refactor(frontend): delete the hand-written auth code` | `session.ts`, `authApi.ts`, `credentials.ts`, token parts of `tabSync`, old pages, `AuthCard`, `api/account.ts` | done |
| 30 | K5 | `chore: delete apps/auth and apps/user` | Internal guard, rate limiters, `JWT_PRIVATE_KEY`, `INTERNAL_API_TOKEN`, `dev.sh` blocks, drop the `users` table | todo |
| 31 | K5 | `docs: document the /bff routes and add the ADR for Q10–Q13` | `openapi.yaml`, `api-docs.mjs`, ADR, phase 12 notes in `PHASES.md` and its status set to `done`. Then run K5's "Done when" | todo |

K6 (the Kafka event listener) is phase 15, not part of this file.

## Decisions

Made by the owner during phase 12:

- **2026-11-18, name field:** one "Name" field: Keycloak's `firstName` labelled "Name", `lastName` removed from the user profile.
- **2026-11-18, password reset:** off, as before (no SMTP). The login page keeps "There is no password reset yet. Keep your password somewhere safe."
- **2026-11-18, BFF port:** the BFF uses port **3007** until K5. The realm's back-channel URL is `http://host.docker.internal:3007/bff/backchannel-logout`, and commit 16's config defaults to 3007. When `apps/auth` is deleted (commit 30), move the BFF, the realm URL and the Vite proxy to 3005.
- **2026-11-18, theme design reference:** the phase 10 pages (`AuthCard`, `pageStyles.ts`), no separate mock-up.
- **2026-11-18, theme JAR build:** local JDK and Maven (no Docker build stage); `scripts/dev.sh` fails early without them.
- **2026-11-18, Google without credentials:** the provider stays disabled and the button is hidden. **Button position:** above the form with an "or" divider (commit 15).
- **2026-11-18, Q13:** token handler. The BFF keeps the tokens in the Redis session and adds the bearer token when it proxies; the browser only has the session cookie.
- **2026-11-18, session encryption:** the session value in Redis is encrypted with AES-256-GCM, key from `SESSION_ENCRYPTION_KEY` (commit 18).
- **2026-11-18, workflow:** work on `master`, one commit per session, the owner commits (this file's rules).

Still open. Ask before the commit named:

| Question | Before commit | Recommended |
|---|---|---|

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

### After commit 13 (2026-11-18)
- Written but **not run**: Maven is not installed here (no sudo, and a download of it was blocked), so the JAR build, the mount and the theme in the real Keycloak are untested. First check for the owner: install Maven, run `scripts/dev.sh --reset-realm --setup-only`, then open the login page on 5173 and check it, including the open items from commits 10–12 (field order, lockout message, error texts, axe).
- `scripts/dev.sh` builds the theme before starting Keycloak, takes the first `*.jar` in `apps/keycloak-theme/dist_keycloak`, and exports its sha256 as `THEME_JAR_SHA`; compose passes it to the container so a changed JAR recreates it. Compose mounts the folder, not the file, to avoid Docker creating a directory when the build is missing. If the JAR name is not what Keycloakify writes, fix the glob.
- `loginTheme` is in the realm JSON, so an existing realm needs `--reset-realm` to get it.

### After commit 14 (2026-11-18)
- The realm file has `identityProviders` (`google`, `enabled: false`, `${GOOGLE_CLIENT_ID}` / `${GOOGLE_CLIENT_SECRET}`) and an `identityProviderMappers` entry `google-name` (claim `name` into `firstName`). Compose passes both variables (empty when unset). `scripts/dev.sh` sets `enabled` through `kcadm` on every start (true only with both credentials), after the optional realm reset. Reasons are in `infra/keycloak/README.md`.
- Tested against the running Keycloak by hand (Maven is still missing, so `dev.sh` itself did not run; its new block is only syntax-checked): the realm reimports with the provider and mapper; disabled, the auth page has no `broker/google` link; enabled, it has one; disabled again, it is gone. A broker login with fake credentials returned 400. Keycloak starts with empty credentials.
- Not tested (needs real Google credentials): the consent flow, that `google-name` really overrides the given name Google's own import sets, `trustEmail`, and linking to an existing password account (`login-idp-link-confirm`).
- Commit 15: the theme reads `kcContext.social.providers`; a disabled provider is not in that list. The button's `href` is the provider's `loginUrl`.

### After commit 15 (2026-11-18)
- `src/login/SocialProviders.tsx` renders one `st-button st-button-secondary` link per entry of `kcContext.social.providers` ("Continue with {displayName}", `href` = `loginUrl`), then an "or" divider. It sits above the form on `Login` and `Register` (not through the Template's `socialProvidersNode`, which renders below). With no providers (Google disabled) it renders nothing. Copy keys `continueWith`, `orDivider`.
- Keycloakify types `social` on the login pages only, so `KcContext.ts` declares it for `register.ftl` and `getSocialProviders` reads it with type guards. **Not verified:** that Keycloak really passes `social` to `register.ftl`; if the register page shows no button with Google enabled, that is why. Check in the compose Keycloak once Maven is installed (commit 13 note).
- Stories `WithGoogle` on login and register. Only `tsc`, `pnpm build` and the Storybook build ran; the stories were not looked at in a browser.

### After commit 16 (2026-11-18)
- `apps/bff` is `@stock-platform/bff`: Fastify, same layout as the other services (`config/`, `routes/`, `services/`, `server.ts`, `app.ts`). Only `/health`, `/health/live` and `/health/ready` (Redis ping) exist. Default port 3007. No cookie, proxy or OIDC packages yet: each later commit adds what it needs (`openid-client` in 17, `@fastify/cookie` in 19, a proxy in 23).
- Config: `KEYCLOAK_ISSUER_URL` (public, default `http://localhost:5173/realms/stock-platform`, for browser redirects and the `iss` check) and `KEYCLOAK_INTERNAL_URL` (default `http://localhost:8180/realms/stock-platform`, for discovery, token, JWKS, revoke), `KC_BFF_CLIENT_ID` (default `stock-bff`), `KC_BFF_CLIENT_SECRET` (required, already in `.env.local`), `PUBLIC_ORIGIN`, `REDIS_URL`. `dev.sh`, compose and the Vite proxy do not start or route to the BFF yet (K5 wires them).
- Tested: `pnpm build`; started `dist/index.js` against the local Redis on another port: `/health/ready` returned 200 with `redis: true`, `/health/live` ok, SIGTERM shut it down cleanly. Not tested: Redis down (503 path is the copied auth code).

### After commit 17 (2026-11-18)
- `apps/bff/src/services/oidc.service.ts` has `discoverOidc(settings)`, called in `buildApp`; it returns an `openid-client` `Configuration` (v6.8.9, `ClientSecretPost` from `KC_BFF_CLIENT_SECRET`). It is only logged for now: commit 18+ should pass it to the routes (decorate the app or pass it as a plugin option).
- **`client.discovery()` is not used.** Asking the internal URL (8180) returns `issuer` 5173 (`KC_HOSTNAME`), and `discovery()` rejects an issuer that differs from the URL it fetched. So the document is fetched by hand from `KEYCLOAK_INTERNAL_URL`, its `issuer` is checked against `KEYCLOAK_ISSUER_URL`, and `new client.Configuration(metadata, id, secret)` is built from it. Token, JWKS and introspection endpoints in it are on 8180; authorization and end-session endpoints are on 5173 (for browser redirects).
- `allowInsecureRequests(config)` is called only when the internal URL is `http:`. The BFF now fails to start when Keycloak is down or the issuer differs (fatal error at boot).
- Tested against the running compose Keycloak: starts and logs the issuer; a wrong `KEYCLOAK_ISSUER_URL` and an unreachable internal URL both stop the start with a clear error. The code exchange itself is untested (commit 20).

### After commit 18 (2026-11-18)
- `apps/bff/src/repositories/session.repository.ts`: `SessionRepository(redis, crypto)` with `create(session) → id`, `get(id)`, `save(id, session)`, `delete(id)`, `deleteBySid(sid)`, `deleteBySub(sub)`. `get` returns `undefined` for a missing, expired, undecryptable or malformed value (callers answer 401); a Redis error rejects (callers answer 503). `create` always makes a new id; the callback (commit 20) must not reuse the old one. The TTL follows `refreshExpiresAt`.
- `services/session-crypto.ts`: AES-256-GCM, stored as base64url of `iv | tag | ciphertext`, the Redis key is the AAD, so a value copied to another key does not decrypt. `SESSION_ENCRYPTION_KEY` (32 bytes base64url) is required in config, generated into `.env.local` by `dev.sh`, documented in `.env.local.example`. Changing it logs everybody out.
- The repository is built in `buildApp` but not yet passed to routes: commit 19 should keep it in a variable and hand it to the routes.
- One session per Keycloak `sid` (`bff:sid:<sid>` holds one id). `delete` of an unreadable session leaves its two index keys until their TTL.
- Tested against the local Redis with a script (not committed): roundtrip, value not readable in Redis, TTL 7 d, user set TTL, foreign-key and wrong-key values rejected, `deleteBySid`, `deleteBySub`. Not tested: `dev.sh` generating the key (syntax only), no unit tests in the repo (the BFF has no test setup yet).

### After commit 19 (2026-11-18)
- `GET /bff/login` is in `src/routes/auth.routes.ts` (`authRoutes`, deps: `oidc`, `publicOrigin`, `production`). The authorize URL is built in `services/login.service.ts` (`startLogin`: fresh `state`, `nonce`, S256 PKCE verifier, scope `openid`, `redirect_uri` = `PUBLIC_ORIGIN/bff/callback`). `prompt` (only `create`), `idp` (only `google`, sent as `kc_idp_hint`) and `action` (`UPDATE_PROFILE`, `UPDATE_PASSWORD`, `delete_account`, sent as `kc_action`) are a TypeBox allow-list: any other value is `400 VALIDATION_ERROR`. `returnTo` is not rejected, it falls back to `/`.
- The `login` cookie (name `LOGIN_COOKIE`): `HttpOnly`, `SameSite=Lax`, `Path=/bff/callback`, 10 minutes, `Secure` in production, signed by `@fastify/cookie`. Its value is base64url JSON `{ state, nonce, codeVerifier, returnTo }`; commit 20 reads it with `request.unsignCookie(request.cookies.login)` and `decodeLoginState` (TypeBox-checked, `undefined` when malformed), then clears it. The signing secret is HKDF of `SESSION_ENCRYPTION_KEY` (`deriveCookieSecret` in `app.ts`), so changing that key also invalidates pending logins. The cookie is signed, not encrypted: the PKCE verifier is readable by the browser (it is the browser's own flow, so this matches the plan).
- `services/return-to.ts` is `safeReturnTo` copied from the frontend's `redirect.ts`, with the same tests (`return-to.test.ts`, 18 cases) plus `/bff` and `/bff/*` excluded. The BFF now has `vitest` (`pnpm --filter @stock-platform/bff test`); `tsconfig.json` excludes `*.test.ts` from the build. Turbo has no `test` wiring for it (the frontend is the same).
- The `oidc` configuration now goes to the routes; `SessionRepository` is still only built in `buildApp`, commit 20 must pass it on.
- Tested: `pnpm build`, unit tests, and the real BFF against the compose Keycloak and Redis: `302` with the cookie and every parameter, `400` for a bad `action` or `prompt`, `//evil.com` still redirects (to `/` in the cookie). Keycloak (8180) showed the login page for the default URL and the register page (`firstName`, `password-confirm`) for `prompt=create`. Not tested: `kc_idp_hint` and `kc_action` in Keycloak (need Google credentials and a session), and anything through 5173 (the Vite dev server was not running).

### After commit 20 (2026-11-18)
- `GET /bff/callback` is in `routes/auth.routes.ts`; the grant is in `services/callback.service.ts` (`completeLogin`, `sessionFromTokens`). Order: read and verify the signed `login` cookie (`400 LOGIN_EXPIRED`), compare `state` (`400 STATE_MISMATCH`), clear the cookie (always, it is single use), then: a query `error` redirects to the cookie's `returnTo` and touches no session; otherwise `authorizationCodeGrant` with `pkceCodeVerifier`, `expectedState` and `expectedNonce`. A replayed or rejected code is `400 LOGIN_REJECTED`; Keycloak unreachable or timing out is `503 SERVICE_UNAVAILABLE`. These are sent from the route, not thrown, so the cleared cookie stays on the response.
- The session cookie is set here: `session` (`__Host-session` in production, `sessionCookieName` in `services/session-cookie.ts`), `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in production, expires at `refreshExpiresAt`. Its value is the bare session id. Commits 21 to 25 read it with `request.cookies[sessionCookieName(production)]`.
- A session cookie that arrives with the callback (an account action) has its old session deleted after the new one is saved, so the `bff:sid:<sid>` index, which now points at the new id, does not leave an orphan.
- The session's `name` and `email` come from the new ID token, so an action refreshes them (commit 28 relies on it). `refreshExpiresAt` uses Keycloak's `refresh_expires_in`; without it, the access lifetime.
- `AuthRouteDeps` now takes `sessions` (only `create` and `delete`); `buildApp` passes the repository.
- Tested for real against the compose Keycloak and Redis (Vite was not running, so the form post went to 8180 and the callback URL was replayed against the BFF on 3007): register with `prompt=create` then callback gives `302 /settings`, the `session` cookie and the three Redis keys; the same code again is `400`; a second login over SSO replaces the session and deletes the old Redis entry; `error=access_denied` redirects to `returnTo` with no session cookie. Vitest: state mismatch, forged and missing cookie, Keycloak error, hostile `returnTo`, token endpoint down (`503`), and `sessionFromTokens`.
- Not tested: through 5173 in a browser, `kc_action_status` after a real account action (commit 28), and the `Secure` / `__Host-` cookie in production.
- A Keycloak `error` that is not a cancelled action (such as `login_required`) also goes back to `returnTo`. If the page needs a session, the frontend then goes to `/bff/login` again; watch for a loop in commit 27.

### After commit 21 (2026-11-18)
- `GET /bff/me` is in `routes/auth.routes.ts`: `{ user: { id, name, email } }` from the session (`sub`, `name`, `email`), `401 UNAUTHENTICATED` for no cookie or a missing, expired or unreadable session, `503 SERVICE_UNAVAILABLE` when the session store (Redis) throws. `Cache-Control: no-store`. No tokens in the body. `AuthRouteDeps.sessions` now also takes `get`.
- **Keycloak is not contacted yet**, so the 503 today means Redis is down. Commit 22 should make `/bff/me` go through the refresh helper once it exists, so a session with an expired access token is refreshed there, and a Keycloak outage during that refresh gives the 503. A still-valid access token must keep working while Keycloak is down.
- Tested: `pnpm build`; vitest (401 without cookie, 401 unknown id, 200 with no tokens in the body, 503 on a store error). Not tested against the real Redis and Keycloak by hand, or through 5173.

### After commit 22 (2026-11-18)
- `services/token-refresh.service.ts`: `TokenRefresher(oidc, sessions)` with `getSession(id)`. It returns the session as stored while the access token has more than 30 s left (`REFRESH_WINDOW_MS`); otherwise it calls `refreshTokenGrant`, saves the result with `sessions.save` and returns it. Concurrent calls for one id share one request (an in-process map of promises, removed when it settles). Commit 23's proxy must call `getSession` for every request and use the returned `accessToken`.
- Outcomes: no session → `undefined`; refresh token expired (`refreshExpiresAt`) or refused by Keycloak (`invalid_grant`, any OAuth error answer) → the session is deleted and `undefined` (401); Keycloak unreachable or timing out → `IdentityProviderUnavailableError` (503), **except** that a token that has not expired yet is returned as it is, so a Keycloak outage does not hurt requests until the token's own `exp`. A Redis error is thrown as it is.
- A refresh response without `refresh_token` or `id_token` keeps the stored ones (rotation is off). `name` and `email` follow a new ID token if one comes. `refreshExpiresAt` only moves if the response has `refresh_expires_in`; the Redis TTL follows it through `save`.
- `/bff/me` now goes through `getSession`; `AuthRouteDeps` takes `tokens` and `sessions` no longer needs `get`. `buildApp` builds the refresher.
- Tested: vitest with a real local HTTP token endpoint (no refresh with more than 30 s left, refresh within it, three concurrent callers make one request, `invalid_grant` deletes, expired refresh token deletes without a call, Keycloak down with a valid and with an expired token). `pnpm build` passes. **Not tested** against the compose Keycloak and Redis by hand, or through 5173; a rotation-on Keycloak is not supported (see 08-identity.md).
- Small gap: a caller that reads the session just as another refresh finishes can start a second refresh with the old refresh token. Harmless with rotation off; the Redis lock for scaling would close it.

### After commit 23 (2026-11-18)
- `routes/proxy.routes.ts` (`proxyRoutes`, deps `upstream`, `production`, `tokens`) forwards `GET/HEAD/POST/PUT/PATCH/DELETE` on `/quotes/*` and `/stream` to `SSE_SERVICE_URL` (new config, default `http://localhost:3003`) with `@fastify/reply-from` (undici, `headersTimeout` and `bodyTimeout` 0). Per request: no cookie `401`; `tokens.getSession` throws `503`; unknown session `401`; then `Authorization: Bearer <accessToken>` replaces whatever the browser sent, `cookie` is dropped, `x-forwarded-for` is set. Upstream unreachable is `502 UPSTREAM_UNAVAILABLE`. Add `/portfolio/*` later with a route of its own and its own upstream.
- The plugin is **encapsulated** (not `fp`) because it adds a catch-all content-type parser that passes bodies through raw; keep it away from `/bff/*`.
- `services/csrf.ts`: `requireCsrfHeader` (a `preHandler`, `403 CSRF_REJECTED` unless the method is GET/HEAD/OPTIONS or `X-Requested-With: fetch`). Commit 24 uses it on `POST /bff/logout`; commit 25 must not (Keycloak cannot send it).
- Tested: vitest with real local HTTP upstreams (bearer set, cookie and forged `Authorization` stripped, query kept, 401/503/403/502, POST body forwarded, SSE first event arrives while the upstream response is still open, the browser side ends with the upstream, the upstream closes when the browser leaves). By hand against compose Keycloak and Redis: a freshly registered user's session; `/quotes/...` reached a stub on 3003 with a real RS256 Keycloak bearer and no cookie; `/stream` passed an event; 401 and 403 as above.
- **Not tested:** the real SSE service (its guard only takes the old HS256 token until commit 26), `session-expired` at the token's `exp` with the real service, a token refresh during a stream, and anything through 5173. The Vite proxy still sends `/quotes` and `/stream` straight to 3003 until commit 27.

### After commit 24 (2026-11-18)
- `POST /bff/logout` is in `routes/auth.routes.ts` (`preHandler: requireCsrfHeader`, so `403` without `X-Requested-With: fetch`). It reads the session straight from the repository (no refresh: a logout must not need Keycloak), deletes it, clears the `session` cookie, revokes the refresh token (`services/logout.service.ts`, best effort: a failure is only logged) and answers `{ endSessionUrl }`: Keycloak's end-session URL with `id_token_hint` and `post_logout_redirect_uri` = `PUBLIC_ORIGIN/`. The page must navigate there (commit 27). `AuthRouteDeps.sessions` now also takes `get`.
- With no cookie, or an unknown or unreadable session, it answers `200 { endSessionUrl: null }` (the frontend should then just go to `/`); the Keycloak SSO session is not ended in that case, so the next login can succeed silently. A Redis error is `503` and the cookie stays.
- **`discoverOidc` now rewrites `revocation_endpoint`** to the internal URL: Keycloak lists it on the public address (5173), which the BFF cannot reach server to server. The end-session and authorization endpoints stay public on purpose. Commit 25 does not need other endpoints, only the JWKS (`jwks_uri`, already internal).
- Post-logout redirect `http://localhost:5173/` is covered by the realm client's `http://localhost:5173/*`.
- Tested: `pnpm build`; vitest (403 without the header, full logout with a local revocation endpoint that records the call, revocation refused still logs out, no session, store down). Against the compose Keycloak: revocation of a bogus token succeeds (RFC 7009) and the end-session URL is built. **Not tested:** a full logout with a real session, that Keycloak really ends the SSO session and returns to `/` (needs 5173 and a browser), and that a revoked refresh token is refused afterwards.

### After commit 25 (2026-11-18)
- `POST /bff/backchannel-logout` is in `routes/auth.routes.ts`, in its own encapsulated scope that parses `application/x-www-form-urlencoded` (no form-body dependency). The check is `services/logout-token.service.ts` (`verifyLogoutToken`, uses `jose`, new dependency): signature from `createRemoteJWKSet(jwks_uri)` (internal address, RS256 only), `iss`, `aud` = `stock-bff`, `iat`, `jti`, the back-channel `events` claim, no `nonce`, and `sid` or `sub`. `sid` deletes that one session (`deleteBySid`); only a `sub` deletes all of the user's (`deleteBySub`). No cookie and no CSRF header, on purpose.
- Answers: `200 {}` on success (also when no session matched), `400 INVALID_LOGOUT_TOKEN` for a missing or bad token, `503` when the key set cannot be fetched or Redis fails. `jti` replay is not tracked: deleting an already deleted session does nothing, so a replay is harmless.
- `AuthRouteDeps.sessions` now also needs `deleteBySid` and `deleteBySub`; `logoutKeys` is an optional dep so tests can use a local key set. `buildApp` is unchanged.
- Tested: vitest (verifier: valid sid and sub, wrong key, issuer, audience, nonce, no event, no sid/sub, expired, `alg: none`, no `jti`, key fetch failure; route: both deletions, 400s, 503). By hand against compose Keycloak and Redis: a user logged in through `/bff/login` (callback replayed on 3007, Vite not running), then an admin `users/<id>/logout` made Keycloak call `host.docker.internal:3007`; `/bff/me` went from 200 to 401 and the user's Redis keys were gone. The test user was deleted.
- **K4 "Done when", partly:** not run in a browser through 5173. Not seen: that only the `session` cookie is in the browser, `/stream` through the BFF with the real SSE service (its guard takes HS256 until commit 26), a token expiry mid-stream, and the logout ending the SSO session. Commit 27 covers these once the frontend uses the BFF.

### After commit 26 (2026-11-18)
- `createJwtGuard` accepts `ES256` and `RS256`. jose picks the key by `kid` and algorithm from the JWKS, so each issuer's tokens only verify against that issuer's keys; the issuer and audience checks are unchanged (an `aud` array that contains `stock-platform` passes, as Keycloak's `["stock-platform", "account"]` needs).
- SSE service: `AUTH_SERVICE_URL` is replaced by `JWKS_URL`, a full URL, default `http://localhost:3005/.well-known/jwks.json`, so nothing changes until commit 27 points it at Keycloak: `JWKS_URL=http://localhost:8180/realms/stock-platform/protocol/openid-connect/certs` and `JWT_ISSUER=http://localhost:5173/realms/stock-platform` (the `KC_HOSTNAME` URL). `dev.sh` and `.env.local` set neither yet; commit 27 sets both in `dev.sh` and `.env.local.example`. The user service keeps its own `AUTH_SERVICE_URL` until commit 30.
- Keycloak's certs list also has an `RSA-OAEP` `enc` key; jose ignores it for signature checks.
- Tested: `pnpm build`; a throwaway script with a local JWKS (ES256 ok, RS256 ok, `aud` array ok, wrong `aud` 401, `PS256` 401). **Not tested:** a real Keycloak access token against the SSE service (needs a login; commit 27 covers it). No unit tests were added: `packages/auth-guard` has no test setup.

### After commit 27 (2026-11-18)
- The app now runs on the BFF. `api/client.ts` is a plain `fetch` (`same-origin`, `X-Requested-With: fetch`); a `401` calls `onSessionEnded` listeners (`api/index.ts`) and throws `LoggedOutError`, so the hooks that catch it are unchanged. `AuthProvider` asks `GET /bff/me` (`auth/bffApi.ts`: `fetchMe`, `logOutOnServer`); the state is `checking | unavailable | authenticated | anonymous` (no logout reason any more). The guard (`RouteGuards.tsx`) leaves for `/bff/login?returnTo=…` with `window.location.replace` and shows the splash meanwhile; `/login` and `/register` (`AuthEntry`) redirect the same way, with `prompt=create` for register, and keep honouring the old `?next=`. `AuthUser` is in `auth/user.ts`.
- Logout: `POST /bff/logout`, post `{ type: "logout", endSessionUrl }` on `BroadcastChannel("auth")` (`auth/logoutChannel.ts`), then `location.assign(endSessionUrl ?? "/")`. Other tabs go to the **same end-session URL**, not to `/bff/login`: that way no tab can log back in silently through the SSO session the first tab is still ending. A failed logout call reloads `/`. The tab does not change its state before leaving, or the guard would redirect to the login first.
- `usePriceStream` no longer renews anything: on `session-expired` it reconnects at once, and the BFF refreshes the token on that request.
- Vite proxy: `/bff`, `/quotes`, `/stream` go to `VITE_BFF_URL` (default `http://localhost:3007`); `/auth`, `/users` and `VITE_SSE_URL`, `VITE_AUTH_URL`, `VITE_USER_URL` are gone. `PHASES.md` still mentions the old variables (history; commit 31).
- `.env.local.example` now has the Keycloak `JWT_ISSUER` and `JWKS_URL`. `scripts/dev.sh` rewrites an old `.env.local`'s `JWT_ISSUER=stock-auth` and the 3005 `JWKS_URL` to the Keycloak values (custom values stay). The same edit was applied by hand to this machine's `.env.local`. `JWT_ISSUER` is shared with `apps/auth` and `apps/user` until commit 30; they still start but nothing calls them.
- **Done here that the table gave to later commits, because the build needed it:** the three settings sections (`ProfileSection`, `PasswordSection`, `DangerZone`) and `LoginPage`, `RegisterPage`, `authForm.tsx` are deleted (they used `useAuth().logIn`). `SettingsPage` shows only name and email until commit 28 adds the buttons (`SettingsSection` in `pages/settings/fields.tsx` is there to reuse).
- **Still in the tree for commit 29:** `auth/session.ts`, `authApi.ts`, `credentials.ts`, `tabSync.ts` (+ test), `AuthCard` and `pageStyles` users, `api/account.ts`, `pages/settings/validation.ts` (+ test, and `fields.tsx` pieces nothing uses once 28 is in). Nothing imports the first four any more except each other. `redirect.ts` stays: it validates the `?next=` of old links and `returnTo`.
- Tested for real with headless Chrome (playwright-core from a scratch dir, system Chrome) against the compose Keycloak, Redis, the real BFF, SSE service and Vite: a page without a session goes to Keycloak; `/register?next=/history/AAPL?x=1` registers and lands on that page; the shell shows the name; the only cookie is `session` (httpOnly, `document.cookie` empty, empty local and session storage); a reload keeps the session; `/stream` and `/quotes/discovery/active-stocks` work through the BFF with a Keycloak RS256 token ("Live feed"); `curl /quotes/AAPL/snapshot` without a cookie is `401`; logging out in one tab sent both tabs to Keycloak's end-session URL and `/bff/me` was `401` after. With `accessTokenLifespan=40` the stream reconnected at 1, 39, 79 and 119 s, stayed "Live feed" and `/bff/me` was still `200` (the realm was set back to 600). The Keycloak default theme was shown: Maven is still missing, so the theme JAR is not built (commit 13 note).
- **Not tested:** `scripts/dev.sh` itself (it stops at the Maven check; only its `sed` was run on a copy and `bash -n`), Google sign-in, a Keycloak-down startup (`unavailable` splash) in a browser, a back-channel logout from the admin console reaching an open tab (the next request gets `401`), the `__Host-session` cookie in production, and the K5 "Done when" items for settings and delete (commits 28–31). Two older test users (`cb17581@…`, `p23-…`) were already in the realm; the ones from this session were deleted.
- `pnpm build` and the frontend Vitest suites pass (49 tests; the old session tests in `client.test.ts` were replaced by tests for the new client, `redirect.test.ts` now covers `bffLoginUrl`).

### After commit 28 (2026-11-18)
- `SettingsPage` has Account (read-only name and email), Profile ("Edit profile"), Password ("Change password") and Danger zone ("Delete account"). Each button is a plain `<a>` to `bffActionUrl(action, "/settings")` (`auth/redirect.ts`, `/bff/login?action=…&returnTo=%2Fsettings`, tested). All three return to `/settings`, so cancelling an action lands back on Settings. `SettingsField`, `SaveButton` and `SectionMessage` in `pages/settings/fields.tsx` are still unused (commit 29 deletes them with `validation.ts`).
- Tested for real against the compose Keycloak, Redis and the real BFF (curl, with 5173 URLs rewritten to 8180; no browser): `UPDATE_PROFILE` showed the form, the post redirected to the callback with `kc_action_status=success`, the callback went to `/settings` and `/bff/me` then returned the new name. `delete_account` deleted the user in Keycloak.
- **Found, not fixed:**
  - `delete_account` makes Keycloak ask for the password again (the login form), then the confirm page, as the theme's `delete-account-confirm` expects.
  - After the deletion Keycloak shows its **info page** ("deleted successfully") and does **not** redirect to the app, so the browser does not come back to `/bff/callback` and "lands on login" does not happen by itself. Keycloak also sent **no back-channel logout**, so the BFF session stayed valid (`/bff/me` 200) until its access token expires and the next refresh fails (up to 10 minutes). The deleted user's token works against the services for the same time.
  - Options for the owner: a themed `info.ftl` page with a link back to the app (login theme, K2), and/or the phase 15 Kafka listener (K6) deleting the user's BFF sessions on `DELETE_ACCOUNT`. Until then the Settings copy does not promise a sign-out.
- Not tested: in a browser through 5173, `UPDATE_PASSWORD` (same mechanism, not run), cancel of an action, Keycloak's `kc_action_status=cancelled` path, and the theme pages (Maven missing: the default Keycloak theme was shown).

### After commit 29 (2026-11-18)
- Deleted from the frontend: `auth/session.ts`, `authApi.ts`, `credentials.ts`, `tabSync.ts` (+ test; the whole file, since nothing in it was left but the token parts), `components/AuthCard`, `api/account.ts`, `pages/settings/validation.ts` (+ test). `pages/settings/fields.tsx` keeps only `SettingsSection`; `SettingsField`, `SaveButton`, `SectionMessage` and their helpers went. `pageStyles.ts` lost the unused `inputClass` and `linkClass`.
- Tested: `pnpm build` and the frontend Vitest suites (3 files, 38 tests; the removed tests were the deleted modules'). A grep finds no remaining reference. Not run in a browser: nothing but unused code was removed, and no remaining file imports the deleted ones (the build would fail otherwise).
