import type { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import type { Logger } from "@stock-platform/logger";
import { ConnectionTrackerService } from "../services/connection-tracker.service.js";
import { StreamService } from "../services/stream.service.js";

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
  const streamService = new StreamService(fastify.redis);

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    request.raw.setTimeout(0);
    setSseHeaders(reply);
    connectionTracker.increment();

    const writeQuotes = async (): Promise<void> => {
      const quotes = await streamService.collectQuotes(request.query.symbols);
      for (const payload of quotes) {
        reply.raw.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    };

    await writeQuotes();
    const timer = setInterval(() => {
      void writeQuotes().catch((err: unknown) => {
        log.error({ err }, "Failed to stream SSE update");
      });
    }, streamService.getPollIntervalMs());

    request.raw.on("close", () => {
      clearInterval(timer);
      connectionTracker.decrement();
    });

    return reply;
  });
};

export const streamRoutes = fp(streamRoutesImpl, { name: "stream-routes" });
