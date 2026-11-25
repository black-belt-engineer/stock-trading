import replyFrom from "@fastify/reply-from";
import type { FastifyPluginAsync } from "fastify";
import { requireCsrfHeader } from "../services/csrf.js";
import { sessionCookieName } from "../services/session-cookie.js";
import type { TokenRefresher } from "../services/token-refresh.service.js";

export type ProxyRouteDeps = {
  /** Base URL of the service behind `paths`. */
  upstream: string;
  /** Route patterns sent to `upstream`, for example `/quotes/*` and `/stream`. */
  paths: readonly string[];
  production: boolean;
  /** Reads a session and refreshes its access token when it is about to expire. */
  tokens: Pick<TokenRefresher, "getSession">;
};

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Forwards `paths` to one service with `Authorization: Bearer` (registered once per service:
 * `/quotes/*` and `/stream` to the SSE service, `/portfolio/*` to the portfolio service). The browser
 * only has the session cookie; the token comes from the Redis session and never reaches the page.
 * The service still verifies the token itself, so this hop is not a trust boundary.
 *
 * Encapsulated on purpose: the raw body parser below must not touch the `/bff/*` routes.
 */
export const proxyRoutes: FastifyPluginAsync<ProxyRouteDeps> = async (fastify, opts) => {
  const { upstream, paths, production, tokens } = opts;
  const sessionCookie = sessionCookieName(production);

  await fastify.register(replyFrom, {
    base: upstream,
    // A stream has no end and no idle limit: undici's header and body timeouts would cut it.
    // Fastify's own connection and request timeouts default to 0 (off), so nothing else to set.
    undici: { headersTimeout: 0, bodyTimeout: 0 },
  });
  // Bodies of any type go through as they came instead of being parsed (JSON keeps its parser).
  fastify.addContentTypeParser("*", (_request, payload, done) => done(null, payload));

  for (const url of paths) {
    fastify.route({
      method: [...METHODS],
      url,
      preHandler: requireCsrfHeader,
      handler: (request, reply) => forward(request, reply),
    });
  }

  async function forward(
    request: Parameters<typeof requireCsrfHeader>[0],
    reply: Parameters<typeof requireCsrfHeader>[1],
  ): Promise<unknown> {
    reply.header("Cache-Control", "no-store");

    const id = request.cookies[sessionCookie];
    if (id === undefined) {
      return reply.code(401).send({ error: "Not signed in", code: "UNAUTHENTICATED" });
    }

    let session;
    try {
      session = await tokens.getSession(id);
    } catch (error) {
      request.log.error({ err: error }, "Session or identity provider unavailable");
      return reply.code(503).send({ error: "Sign-in is unavailable, try again", code: "SERVICE_UNAVAILABLE" });
    }
    if (session === undefined) {
      return reply.code(401).send({ error: "Not signed in", code: "UNAUTHENTICATED" });
    }

    return reply.from(request.raw.url ?? "/", {
      rewriteRequestHeaders: (_req, headers) => {
        // The session cookie and any token the browser sent stay behind; the service gets the bearer only.
        const { cookie: _cookie, authorization: _authorization, ...rest } = headers;
        return { ...rest, authorization: `Bearer ${session.accessToken}`, "x-forwarded-for": request.ip };
      },
      onError: (res, { error }) => {
        request.log.error({ err: error }, "Upstream request failed");
        void res.code(502).send({ error: "The service is unavailable", code: "UPSTREAM_UNAVAILABLE" });
      },
    });
  }
};
