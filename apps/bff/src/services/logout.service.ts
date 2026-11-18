import * as client from "openid-client";
import type { Session } from "../repositories/session.repository.js";

/**
 * Tells Keycloak to drop the refresh token. A failure is returned, not thrown: the BFF session is
 * already gone by then, and the user must still reach the end-session URL.
 */
export async function revokeRefreshToken(oidc: client.Configuration, session: Session): Promise<Error | undefined> {
  try {
    await client.tokenRevocation(oidc, session.refreshToken, { token_type_hint: "refresh_token" });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Keycloak's end-session URL (public address, the browser navigates to it). With `id_token_hint`
 * Keycloak ends the SSO session without a confirmation page and returns to `postLogoutRedirectUri`,
 * which the realm's client allows.
 */
export function buildLogoutUrl(oidc: client.Configuration, session: Session, postLogoutRedirectUri: string): string {
  return client.buildEndSessionUrl(oidc, {
    id_token_hint: session.idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  }).href;
}
