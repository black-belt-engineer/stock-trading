import { AppError, UnauthorizedError } from "@stock-platform/errors";
import type { preHandlerAsyncHookHandler } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type JwtGuard = preHandlerAsyncHookHandler;

export type JwtGuardOptions = {
  jwksUrl: URL;
  issuer: string;
  audience: string;
};

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the JWT guard on protected routes. */
    authUserId?: string;
  }
}

// jose error codes meaning "this token is bad" (as opposed to "could not fetch the keys").
const TOKEN_ERROR_PREFIXES = ["ERR_JWT_", "ERR_JWS_", "ERR_JWKS_NO_MATCHING_KEY", "ERR_JWKS_MULTIPLE"];

function isTokenError(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  return typeof code === "string" && (TOKEN_ERROR_PREFIXES.some((p) => code.startsWith(p)) || code === "ERR_JOSE_ALG_NOT_ALLOWED");
}

/**
 * Stateless guard: verifies the access token locally against the auth service's public keys.
 * The JWKS is fetched once and cached by jose; it is refetched only for an unknown `kid`.
 */
export function createJwtGuard(options: JwtGuardOptions): JwtGuard {
  const jwks = createRemoteJWKSet(options.jwksUrl);

  return async (request) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ["ES256"],
        issuer: options.issuer,
        audience: options.audience,
      });
      if (!payload.sub) {
        throw new UnauthorizedError("Invalid token");
      }
      request.authUserId = payload.sub;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      if (isTokenError(err)) {
        throw new UnauthorizedError("Invalid or expired token");
      }
      throw new AppError("Unable to verify token", 503, "JWKS_UNAVAILABLE");
    }
  };
}
