import * as client from "openid-client";
import type { Session, SessionRepository } from "../repositories/session.repository.js";
import { IdentityProviderUnavailableError } from "./callback.service.js";

/** An access token that expires within this time is refreshed before it is used. */
export const REFRESH_WINDOW_MS = 30_000;

type Store = Pick<SessionRepository, "get" | "save" | "delete">;

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** True when Keycloak answered and said no (an expired or revoked refresh token), not when it is unreachable. */
function isRejection(error: unknown): boolean {
  return (
    error instanceof client.ResponseBodyError ||
    (error instanceof client.ClientError && error.code !== "OAUTH_TIMEOUT" && error.code !== "OAUTH_ABORT")
  );
}

/**
 * Applies a refresh response to a session. Keycloak may leave out the refresh token (rotation
 * off) or the ID token; the stored ones stay then. `name` and `email` follow the new ID token.
 */
export function refreshedSession(
  session: Session,
  tokens: client.TokenEndpointResponse,
  claims: client.IDToken | undefined,
  now: number,
): Session {
  const expiresIn = positiveNumber(tokens.expires_in);
  if (expiresIn === undefined) {
    throw new IdentityProviderUnavailableError("The refresh response has no expiry");
  }
  const refreshToken = isString(tokens.refresh_token) ? tokens.refresh_token : session.refreshToken;
  const refreshExpiresIn = positiveNumber(tokens["refresh_expires_in"]);
  const email = claims?.["email"];
  const name = claims?.["name"];

  return {
    ...session,
    name: isString(name) ? name : session.name,
    email: isString(email) ? email : session.email,
    accessToken: tokens.access_token,
    accessExpiresAt: now + expiresIn * 1000,
    refreshToken,
    // With a new refresh token and no stated lifetime, keep the old end; it is never extended blindly.
    refreshExpiresAt: refreshExpiresIn !== undefined ? now + refreshExpiresIn * 1000 : session.refreshExpiresAt,
    idToken: isString(tokens.id_token) ? tokens.id_token : session.idToken,
  };
}

/**
 * Hands out sessions with a usable access token. One refresh per session id at a time inside this
 * process: concurrent callers (many tabs, a page load and a stream) share one request to Keycloak.
 * Several BFF instances would need a Redis lock instead (see 08-identity.md).
 */
export class TokenRefresher {
  private readonly inFlight = new Map<string, Promise<Session | undefined>>();

  constructor(
    private readonly oidc: client.Configuration,
    private readonly sessions: Store,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * The session for `id` with an access token good for at least the refresh window, or
   * `undefined` when there is no session or Keycloak refused the refresh (the session is then
   * deleted). Throws `IdentityProviderUnavailableError` when Keycloak cannot be reached and the
   * current token is not usable any more; a Redis error is thrown as it is.
   */
  async getSession(id: string): Promise<Session | undefined> {
    const session = await this.sessions.get(id);
    if (session === undefined) {
      return undefined;
    }
    if (session.accessExpiresAt - this.now() > REFRESH_WINDOW_MS) {
      return session;
    }

    const running = this.inFlight.get(id);
    if (running) {
      return this.withFallback(running, session);
    }

    const refresh = this.refresh(id, session).finally(() => {
      this.inFlight.delete(id);
    });
    this.inFlight.set(id, refresh);
    return this.withFallback(refresh, session);
  }

  /** A token that is still valid keeps working while Keycloak is down. */
  private async withFallback(refresh: Promise<Session | undefined>, current: Session): Promise<Session | undefined> {
    try {
      return await refresh;
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError && current.accessExpiresAt > this.now()) {
        return current;
      }
      throw error;
    }
  }

  private async refresh(id: string, session: Session): Promise<Session | undefined> {
    if (session.refreshExpiresAt <= this.now()) {
      await this.sessions.delete(id);
      return undefined;
    }

    let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
    try {
      tokens = await client.refreshTokenGrant(this.oidc, session.refreshToken);
    } catch (error) {
      if (isRejection(error)) {
        await this.sessions.delete(id);
        return undefined;
      }
      throw new IdentityProviderUnavailableError("Keycloak is not reachable", { cause: error });
    }

    const updated = refreshedSession(session, tokens, tokens.claims(), this.now());
    await this.sessions.save(id, updated);
    return updated;
  }
}
