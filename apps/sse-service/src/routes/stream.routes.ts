import type { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import type { Logger } from "@stock-platform/logger";
import { ConnectionTrackerService } from "../services/connection-tracker.service.js";
import { StreamSubscriptionService } from "../services/stream-subscription.service.js";

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
};

const streamRoutesImpl: FastifyPluginAsync<StreamRouteDeps> = async (fastify, opts) => {
  const { connectionTracker, log } = opts;
  const subscriptionService = new StreamSubscriptionService(fastify.redis);

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    request.raw.setTimeout(0);
    setSseHeaders(reply);
    connectionTracker.increment();

    const initialQuotes = await subscriptionService.getInitialQuotes(request.query.symbols);
    for (const payload of initialQuotes) {
      reply.raw.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    const unsubscribe = subscriptionService.subscribe(fastify.redis, request.query.symbols, (quote) => {
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
