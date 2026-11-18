import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export type LogoutTarget = { kind: "sid"; sid: string } | { kind: "sub"; sub: string };

export class InvalidLogoutTokenError extends Error {}

export interface LogoutTokenSettings {
  issuer: string;
  /** The BFF's own client id. */
  audience: string;
  /** Resolves Keycloak's signing keys (a remote JWKS in production). */
  keys: JWTVerifyGetKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks a logout token as OpenID Connect Back-Channel Logout 1.0 section 2.6 asks: signature
 * against Keycloak's keys (RS256 only), `iss`, `aud`, `iat`, `jti`, the back-channel `events`
 * claim, `sid` or `sub`, and no `nonce`. Returns what to delete: the Keycloak session when `sid`
 * is there, otherwise all of the user's sessions.
 */
export async function verifyLogoutToken(token: string, settings: LogoutTokenSettings): Promise<LogoutTarget> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, settings.keys, {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: ["RS256"],
      requiredClaims: ["iat", "jti", "events"],
    }));
  } catch (error) {
    // A bad token is the sender's fault (400). A key set that cannot be fetched is ours, so that
    // error goes up and the route answers 503.
    if (
      error instanceof errors.JWTInvalid ||
      error instanceof errors.JWSInvalid ||
      error instanceof errors.JWSSignatureVerificationFailed ||
      error instanceof errors.JWTClaimValidationFailed ||
      error instanceof errors.JWTExpired ||
      error instanceof errors.JOSEAlgNotAllowed ||
      error instanceof errors.JWKSNoMatchingKey
    ) {
      throw new InvalidLogoutTokenError("The logout token did not verify", { cause: error });
    }
    throw error;
  }

  if (Object.hasOwn(payload, "nonce")) {
    throw new InvalidLogoutTokenError("A logout token must not have a nonce");
  }
  const events = payload["events"];
  if (!isRecord(events) || !isRecord(events[BACKCHANNEL_EVENT])) {
    throw new InvalidLogoutTokenError("The logout token has no back-channel logout event");
  }

  const sid = payload["sid"];
  if (typeof sid === "string" && sid !== "") {
    return { kind: "sid", sid };
  }
  if (typeof payload.sub === "string" && payload.sub !== "") {
    return { kind: "sub", sub: payload.sub };
  }
  throw new InvalidLogoutTokenError("The logout token has neither sid nor sub");
}
