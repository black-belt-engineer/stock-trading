import type { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import type { Logger } from "@stock-platform/logger";
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

export type StreamRouteDeps = {
  connectionTracker: ConnectionTrackerService;
  log: Logger;
  streamSubscriptionService: StreamSubscriptionService;
};

const streamRoutesImpl: FastifyPluginAsync<StreamRouteDeps> = async (fastify, opts) => {
  const { connectionTracker, log, streamSubscriptionService } = opts;

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    request.raw.setTimeout(0);
    setSseHeaders(reply);
    connectionTracker.increment();

    const initialQuotes = await streamSubscriptionService.getInitialQuotes(request.query.symbols);
    for (const payload of initialQuotes) {
      reply.raw.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    const unsubscribe = streamSubscriptionService.subscribe(request.query.symbols, (quote) => {
      try {
        reply.raw.write(`event: price\ndata: ${JSON.stringify(quote)}\n\n`);
      } catch (err) {
        log.error({ err }, "Failed to write SSE event");
      }
    });

    request.raw.on("close", () => {
      unsubscribe();
      connectionTracker.decrement();
    });

    return reply;
  });
};

export const streamRoutes = fp(streamRoutesImpl, { name: "stream-routes" });
