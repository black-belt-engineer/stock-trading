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

The user profile is a JSON string inside `components`, because Keycloak stores it that way. To change it, edit it in the admin console (Realm settings → User profile → JSON editor) to validate it, then copy the result back here as a single escaped string.
