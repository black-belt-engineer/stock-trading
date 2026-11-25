import { UnauthorizedError } from "@stock-platform/errors";
import type { FastifyRequest } from "fastify";

// Keycloak's `sub` is a UUID; the tables store it in UUID columns.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * The caller's user id, from the verified token (set by the JWT guard). Routes never take a user
 * id from the path or the body, so a caller can only ever reach their own rows.
 * A `sub` that is not a UUID is refused rather than left to fail as a database cast error.
 */
export function userIdOf(request: FastifyRequest): string {
  const id = request.authUserId;
  if (id === undefined || !isUserId(id)) {
    throw new UnauthorizedError("The token's subject is not a user id");
  }
  return id.toLowerCase();
}
