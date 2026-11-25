import type { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { UnauthorizedError } from "@stock-platform/errors";
import type { Logger } from "@stock-platform/logger";
import { retryFrame, SESSION_EXPIRED_FRAME } from "../models/sse-frames.js";
import { lastEventIdFromHeader } from "../models/stream-ids.js";
import { parseSymbolList } from "../models/symbols.js";
import { SseConnection } from "../services/sse-connection.js";
import type { StreamHub } from "../services/stream-hub.service.js";

function setSseHeaders(reply: FastifyReply): void {
  reply.raw.setTimeout(0);
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders?.();
}

// setTimeout fires at once for delays above 2^31 - 1 ms; tokens live minutes, but stay safe.
const MAX_TIMER_MS = 2_147_483_647;

/** Sent once at connect (S1 step 6): the first step of the client's own backoff. */
const RETRY_HINT_MS = 1000;

export type StreamRouteDeps = {
  log: Logger;
  streamHub: StreamHub;
};

const streamRoutesImpl: FastifyPluginAsync<StreamRouteDeps> = async (fastify, opts) => {
  const { log, streamHub } = opts;

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    // Validated before any SSE header is sent, so a bad list gets a normal 400 or 404.
    const symbols = parseSymbolList(request.query.symbols);
    // Set by the JWT guard; checked here because the expiry timer below depends on it.
    const expiresAt = request.authExpiresAt;
    if (expiresAt === undefined) {
      throw new UnauthorizedError("Missing token expiry");
    }
    // S1 resume. Client-controlled: anything but `<digits>-<digits>` counts as no id (a snapshot).
    const lastEventId = lastEventIdFromHeader(request.headers["last-event-id"]);

    request.raw.setTimeout(0);
    setSseHeaders(reply);
    const connection = new SseConnection(reply.raw, { log });
    connection.write(retryFrame(RETRY_HINT_MS));

    // The hub sends a replay of what this client missed, or a `snapshot` (current state, which
    // clients keep out of the feed), then live `price` events.
    const unsubscribe = streamHub.subscribe(
      {
        symbols: new Set(symbols),
        send: (frame) => connection.write(frame),
        end: () => connection.end(),
      },
      lastEventId,
    );

    // A stream must not outlive its token, or it would stay open after logout. At `exp` the
    // server says why it closes, so the client refreshes and reconnects at once instead of
    // treating the close as a dropped connection. This ends the heartbeat too: it takes precedence.
    const expiryTimer = setTimeout(
      () => connection.end(SESSION_EXPIRED_FRAME),
      Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS),
    );

    // Attached before anything is awaited, so a client leaving at once is still cleaned up.
    reply.raw.on("close", () => {
      clearTimeout(expiryTimer);
      connection.dispose();
      unsubscribe();
    });

    return reply;
  });
};

export const streamRoutes = fp(streamRoutesImpl, { name: "stream-routes" });
