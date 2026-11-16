import type { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { UnauthorizedError } from "@stock-platform/errors";
import type { Logger } from "@stock-platform/logger";
import { parseSymbolList } from "../models/symbols.js";
import type { ConnectionTrackerService } from "../services/connection-tracker.service.js";
import type { StreamSubscriptionService } from "../services/stream-subscription.service.js";

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

export type StreamRouteDeps = {
  connectionTracker: ConnectionTrackerService;
  log: Logger;
  streamSubscriptionService: StreamSubscriptionService;
};

const streamRoutesImpl: FastifyPluginAsync<StreamRouteDeps> = async (fastify, opts) => {
  const { connectionTracker, log, streamSubscriptionService } = opts;

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    // Validated before any SSE header is sent, so a bad list gets a normal 400 or 404.
    const symbols = parseSymbolList(request.query.symbols);
    // Set by the JWT guard; checked here because the expiry timer below depends on it.
    const expiresAt = request.authExpiresAt;
    if (expiresAt === undefined) {
      throw new UnauthorizedError("Missing token expiry");
    }

    request.raw.setTimeout(0);
    setSseHeaders(reply);
    connectionTracker.increment();

    const initialQuotes = await streamSubscriptionService.getInitialQuotes(symbols);
    // Current state, not trades: sent as `snapshot` so clients keep them out of the feed.
    for (const payload of initialQuotes) {
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    const unsubscribe = streamSubscriptionService.subscribe(symbols, (quote) => {
      try {
        reply.raw.write(`event: price\ndata: ${JSON.stringify(quote)}\n\n`);
      } catch (err) {
        log.error({ err }, "Failed to write SSE event");
      }
    });

    // A stream must not outlive its token, or it would stay open after logout. At `exp` the
    // server says why it closes, so the client refreshes and reconnects at once instead of
    // treating the close as a dropped connection.
    const expiryTimer = setTimeout(() => {
      if (reply.raw.writableEnded || reply.raw.destroyed) return;
      reply.raw.write("event: session-expired\ndata:\n\n");
      reply.raw.end();
    }, Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS));

    request.raw.on("close", () => {
      clearTimeout(expiryTimer);
      unsubscribe();
      connectionTracker.decrement();
    });

    return reply;
  });
};

export const streamRoutes = fp(streamRoutesImpl, { name: "stream-routes" });
