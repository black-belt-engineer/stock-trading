import * as client from "openid-client";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const LOGIN_ACTIONS = ["UPDATE_PROFILE", "UPDATE_PASSWORD", "delete_account"] as const;
export type LoginAction = (typeof LOGIN_ACTIONS)[number];

export interface LoginOptions {
  /** `create` opens the registration page. */
  prompt?: "create";
  /** Skips Keycloak's login page for this identity provider. */
  idp?: "google";
  /** A required action to run after login, sent as `kc_action` (Settings page). */
  action?: LoginAction;
}

/** What the `login` cookie carries from `/bff/login` to `/bff/callback`. */
export const LoginStateSchema = Type.Object({
  state: Type.String({ minLength: 1 }),
  nonce: Type.String({ minLength: 1 }),
  codeVerifier: Type.String({ minLength: 1 }),
  returnTo: Type.String({ minLength: 1 }),
});

export type LoginState = Static<typeof LoginStateSchema>;

export function encodeLoginState(state: LoginState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

/** `undefined` for anything that is not a well-formed login state. */
export function decodeLoginState(value: string): LoginState | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return Value.Check(LoginStateSchema, parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface LoginRequest {
  /** Keycloak's authorize URL, to redirect the browser to. */
  url: URL;
  /** To store in the `login` cookie. */
  state: LoginState;
}

/**
 * Builds the authorization request: a fresh `state`, `nonce` and PKCE verifier for every login
 * (S256), and the optional Keycloak hints. The authorization endpoint is the public one from
 * the discovery document, since the browser follows it.
 */
export async function startLogin(
  config: client.Configuration,
  options: { redirectUri: string; returnTo: string } & LoginOptions,
): Promise<LoginRequest> {
  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const parameters: Record<string, string> = {
    redirect_uri: options.redirectUri,
    scope: "openid",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  };
  if (options.prompt) parameters["prompt"] = options.prompt;
  if (options.idp) parameters["kc_idp_hint"] = options.idp;
  if (options.action) parameters["kc_action"] = options.action;

  return {
    url: client.buildAuthorizationUrl(config, parameters),
    state: { state, nonce, codeVerifier, returnTo: options.returnTo },
  };
}
