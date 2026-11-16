import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@stock-platform/errors";
import type { preHandlerAsyncHookHandler } from "fastify";

export type InternalGuard = preHandlerAsyncHookHandler;

export const INTERNAL_TOKEN_HEADER = "x-internal-token";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Copy of apps/user/src/plugins/internal-guard.ts; both move to packages/auth-guard in phase 10.
 *
 * Lets only other services of the platform through, by a shared secret in `X-Internal-Token`.
 * Both sides are hashed first so `timingSafeEqual` always compares 32 bytes: no early exit on the
 * first wrong character and no leak of the secret's length. Neither value is ever logged.
 *
 * The distinct code lets a caller tell "my service secret is wrong" from a business `401`.
 */
export function createInternalGuard(secret: string): InternalGuard {
  const expected = digest(secret);

  return async (request) => {
    const header = request.headers[INTERNAL_TOKEN_HEADER];
    const provided = typeof header === "string" ? header : "";
    if (provided === "" || !timingSafeEqual(digest(provided), expected)) {
      throw new AppError("Missing or invalid internal token", 401, "INTERNAL_AUTH_FAILED");
    }
  };
}
