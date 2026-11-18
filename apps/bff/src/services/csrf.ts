import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * The CSRF rule for the BFF (phase 10's, now in one place): next to the `SameSite=Strict` cookie,
 * every request that is not a read must carry `X-Requested-With: fetch`. A cross-site form cannot
 * set that header, and a cross-site `fetch` that does is stopped by the CORS preflight.
 */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "fetch";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function hasCsrfHeader(method: string, headers: Record<string, unknown>): boolean {
  return SAFE_METHODS.has(method.toUpperCase()) || headers[CSRF_HEADER] === CSRF_VALUE;
}

/** A `preHandler` hook: answers 403 when the header is missing on a non-read request. */
export async function requireCsrfHeader(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!hasCsrfHeader(request.method, request.headers)) {
    await reply.code(403).send({ error: "Missing X-Requested-With header", code: "CSRF_REJECTED" });
  }
}
