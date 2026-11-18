import { Type, type Static } from "@sinclair/typebox";
import { parseEnv } from "@stock-platform/env";

const schema = Type.Object({
  REDIS_URL: Type.String({ minLength: 1 }),
  /**
   * The issuer Keycloak puts in its tokens: the public URL of the realm, as the browser sees it
   * (through the Vite proxy). Used for the browser redirects and to check the `iss` claim.
   */
  KEYCLOAK_ISSUER_URL: Type.String({ default: "http://localhost:5173/realms/stock-platform" }),
  /**
   * Where the BFF itself reaches Keycloak (discovery, token, JWKS, revoke). Differs from the
   * issuer on purpose: the issuer is public, this one is the internal address.
   */
  KEYCLOAK_INTERNAL_URL: Type.String({ default: "http://localhost:8180/realms/stock-platform" }),
  KC_BFF_CLIENT_ID: Type.String({ minLength: 1, default: "stock-bff" }),
  /** Generated into `.env.local` by `scripts/dev.sh` and imported into the realm. */
  KC_BFF_CLIENT_SECRET: Type.String({ minLength: 1 }),
  /**
   * AES-256-GCM key for the session value in Redis: 32 random bytes, base64url (43 characters).
   * Generated into `.env.local` by `scripts/dev.sh`. Changing it logs everybody out.
   */
  SESSION_ENCRYPTION_KEY: Type.String({ minLength: 43 }),
  /** The SSE service: `/quotes/*` and `/stream` are proxied to it with the bearer token. */
  SSE_SERVICE_URL: Type.String({ default: "http://localhost:3003" }),
  /** The app's public origin: the callback and the post-logout redirect are built from it. */
  PUBLIC_ORIGIN: Type.String({ default: "http://localhost:5173" }),
  PORT: Type.Integer({ minimum: 1, default: 3005 }),
  LOG_LEVEL: Type.String({ default: "info" }),
  NODE_ENV: Type.String({ default: "development" }),
});

export type AppConfig = Static<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (!cached) {
    cached = parseEnv(schema);
  }
  return cached;
}
