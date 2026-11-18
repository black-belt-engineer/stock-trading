# Keycloak realm as code

`realm-stock-platform.json` is the `stock-platform` realm (roadmap `08-identity.md`, K1). Compose mounts this folder at `/opt/keycloak/data/import`, and Keycloak starts with `--import-realm`.

**Keycloak imports a realm only if it does not exist yet.** Editing the JSON changes nothing on a running stack. Apply your edits with:

```sh
scripts/dev.sh --reset-realm --setup-only
```

That deletes the realm, which also deletes its users and sessions, and reimports it. A regenerated `KC_BFF_CLIENT_SECRET` needs a reset as well.

## Rules for the file

- Keep it hand-written and minimal. Do not paste an admin-console export: it contains generated ids, keys and secrets.
- Never commit a secret. Reference an environment variable with `${NAME}`; Keycloak resolves it at import, and compose passes the variable to the container.
- JSON has no comments, so the reasons for the settings are listed here.

## Why the settings are what they are

| Setting | Value | Why |
|---|---|---|
| `registrationEmailAsUsername`, `loginWithEmailAllowed` | `true` | The email is the login, as in the hand-written auth. |
| `rememberMe` | `false` | Sessions last 7 days anyway (the old refresh TTL). |
| `resetPasswordAllowed`, `verifyEmail` | `false` | There is no SMTP yet (owner decision, 2026-11-18). Turn them on together with Mailpit. |
| `passwordPolicy` | `length(8) and maxLength(128)` | The rules of the old `createUserBodySchema`. |
| Brute force | 5 failures, then 15 minutes locked | Replaces phase 10's Redis login limit (5 per email in 15 minutes). `MULTIPLE` with `waitIncrementSeconds` = `maxFailureWaitSeconds` = 900 gives one flat 15-minute lockout. Failures older than 15 minutes (`maxDeltaTimeSeconds`) are forgotten. Two failures less than 1 s apart lock for 1 minute (Keycloak's anti-automation default). Locked users see the same "Invalid username or password" message, so a lockout does not reveal that the account exists. |
| `accessTokenLifespan` | 600 s | Same as the old `ACCESS_TOKEN_TTL_SECONDS`. |
| `ssoSessionIdleTimeout`, `ssoSessionMaxLifespan` | 604800 s (7 days) | Same as the old `REFRESH_TOKEN_TTL_SECONDS`. The BFF's refresh token lives as long as the SSO session. |
| User profile | `username`, `email`, `firstName` labelled "Name" | One name field, like the register form (owner decision, 2026-11-18). `lastName` is removed, so the ID token's `name` claim is just that field. The lengths match the old schema: email ≤ 254, name 1–100. |

| Events | saved for 7 days: login, register, logout, profile and password updates, `DELETE_ACCOUNT` and their errors | K6 (phase 15) reads `DELETE_ACCOUNT`; the rest help debugging. An explicit list, so routine events such as token refreshes are not stored. |
| `roles`, `defaultRole` | `default-roles-stock-platform` with `offline_access`, `uma_authorization` and the `account` roles `view-profile`, `manage-account`, `delete-account` | `delete-account` must be a default role from the first import, or the `delete_account` action fails for every user. Declaring the default role replaces Keycloak's, so the two realm roles it contains are declared too, or the import fails. |
| `requiredActions` | Keycloak's 14 defaults, with `delete_account` enabled | A `requiredActions` list replaces the defaults instead of adding to them, so all are listed. Without them `UPDATE_PROFILE` and `UPDATE_PASSWORD` (the Settings buttons) would not exist. The values are those of a fresh 26.8 realm; check again after a Keycloak upgrade adds actions. |

### Client `stock-bff`

The BFF (`apps/bff`, K4) is the only client. The browser never sees a token.

| Setting | Value | Why |
|---|---|---|
| `publicClient` | `false`, secret `${KC_BFF_CLIENT_SECRET}` | Confidential: the BFF authenticates with a secret that `scripts/dev.sh` writes to `.env.local`. |
| Flows | standard flow only | No implicit flow, no direct access grants (password grant), no service account, no device or CIBA grant. |
| `pkce.code.challenge.method` | `S256` | Required on top of the secret; a request without a challenge is rejected. |
| `redirectUris` | `http://localhost:5173/bff/callback` | Exact, no wildcard. |
| `post.logout.redirect.uris` | `http://localhost:5173/*` | Any page of the app after logout. |
| `frontchannelLogout` | `false` | Back-channel logout only. |
| `backchannel.logout.url` | `http://host.docker.internal:3007/bff/backchannel-logout`, session required | Keycloak calls the BFF on the host when a session ends (admin console, another client, expiry). The logout token carries `sid`. **Port 3007 is temporary** (owner decision, 2026-11-18): 3005 is still `apps/auth` until K5, then the BFF moves to 3005. Once the BFF runs in compose, the host becomes `bff`. |
| Audience mapper | custom audience `stock-platform`, access token only | The services keep `JWT_AUDIENCE=stock-platform`. The access token's `aud` is `["stock-platform", "account"]`; the ID token's stays `stock-bff`. |

The user profile is a JSON string inside `components`, because Keycloak stores it that way. To change it, edit it in the admin console (Realm settings → User profile → JSON editor) to validate it, then copy the result back here as a single escaped string.
