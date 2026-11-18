import * as client from "openid-client";
import type { Session } from "../repositories/session.repository.js";
import type { LoginState } from "./login.service.js";

/** The sign-in cannot be completed: a bad request, not a server fault (answer 400). */
export class LoginRejectedError extends Error {}

/** Keycloak could not be reached or timed out (answer 503). */
export class IdentityProviderUnavailableError extends Error {}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Builds the session from a token response. `name` and `email` come from the ID token, so after
 * an account action the stored user is the new one. Keycloak sends `refresh_expires_in`; without
 * it the refresh token is assumed to live as long as the access token.
 */
export function sessionFromTokens(
  tokens: client.TokenEndpointResponse,
  claims: client.IDToken | undefined,
  now: number,
): Session {
  const { access_token, refresh_token, id_token } = tokens;
  const expiresIn = positiveNumber(tokens.expires_in);
  if (!claims || !isString(id_token) || !isString(refresh_token) || expiresIn === undefined) {
    throw new LoginRejectedError("The token response is missing a token or its expiry");
  }
  const sid = claims["sid"];
  if (!isString(sid)) {
    throw new LoginRejectedError("The ID token has no sid claim");
  }

  const email = claims["email"];
  const name = claims["name"];
  const refreshExpiresIn = positiveNumber(tokens["refresh_expires_in"]) ?? expiresIn;

  return {
    sub: claims.sub,
    sid,
    name: isString(name) ? name : isString(email) ? email : "",
    email: isString(email) ? email : "",
    accessToken: access_token,
    accessExpiresAt: now + expiresIn * 1000,
    refreshToken: refresh_token,
    refreshExpiresAt: now + refreshExpiresIn * 1000,
    idToken: id_token,
  };
}

/** True for an OAuth error answer from Keycloak that is the caller's fault, such as a replayed code. */
function isRejection(error: unknown): boolean {
  return (
    error instanceof client.ResponseBodyError ||
    error instanceof client.AuthorizationResponseError ||
    (error instanceof client.ClientError && error.code !== "OAUTH_TIMEOUT" && error.code !== "OAUTH_ABORT")
  );
}

/**
 * Exchanges the authorization code (PKCE, client secret) and checks `state`, `nonce` and the ID
 * token. `currentUrl` is the callback URL as Keycloak called it, with its query.
 */
export async function completeLogin(
  config: client.Configuration,
  currentUrl: URL,
  login: LoginState,
  now: number = Date.now(),
): Promise<Session> {
  let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
  try {
    tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: login.codeVerifier,
      expectedState: login.state,
      expectedNonce: login.nonce,
    });
  } catch (error) {
    if (isRejection(error)) {
      throw new LoginRejectedError(error instanceof Error ? error.message : "Sign-in rejected");
    }
    // A network failure (TypeError), a timeout or anything else: Keycloak is not answering.
    throw new IdentityProviderUnavailableError("Keycloak is not reachable", { cause: error });
  }
  return sessionFromTokens(tokens, tokens.claims(), now);
}
