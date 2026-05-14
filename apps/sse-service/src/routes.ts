import type { FastifyInstance, FastifyReply } from "fastify";
import type { Redis } from "ioredis";
import type { StreamQuote } from "@stock-platform/types";
import { DEFAULT_SYMBOLS, SSE_POLL_INTERVAL_MS } from "./constants.js";
import { parseSymbols, toStreamQuote } from "./quotes.js";
import { readLatestPrice, readSparkline } from "./redis-quotes.js";
import type { ActiveStock } from "./types.js";
import { log } from "./utils.js";

export type RouteDeps = {
  redis: Redis;
  getActiveConnections: () => number;
  incrementConnections: () => void;
  decrementConnections: () => void;
};

function setSseHeaders(reply: FastifyReply): void {
  reply.raw.setTimeout(0);
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders?.();
}

export function registerRoutes(fastify: FastifyInstance, deps: RouteDeps): void {
  const { redis, getActiveConnections, incrementConnections, decrementConnections } = deps;

  fastify.get("/health", async () => ({
    status: "ok" as const,
    activeConnections: getActiveConnections(),
  }));

  fastify.get<{ Params: { symbol: string } }>(
    "/quotes/:symbol/snapshot",
    async (request, reply) => {
      const symbol = request.params.symbol.toUpperCase();
      const latest = await readLatestPrice(redis, symbol);
      if (!latest) {
        return reply.code(404).send({ error: `No quote found for ${symbol}` });
      }
      return latest;
    },
  );

  fastify.get(
    "/quotes/discovery/active-stocks",
    async (): Promise<{ listName: string; stocks: ActiveStock[] }> => {
      const stocks = await Promise.all(
        DEFAULT_SYMBOLS.map(async (symbol) => {
          const [latest, sparkline] = await Promise.all([
            readLatestPrice(redis, symbol),
            readSparkline(redis, symbol),
          ]);
          return {
            symbol,
            name: latest?.name ?? symbol,
            currentPrice: latest?.currentPrice ?? 0,
            changePercent: latest?.changePercent ?? 0,
            changeValue: latest?.changeValue ?? 0,
            high24h: latest?.high24h ?? 0,
            low24h: latest?.low24h ?? 0,
            volume24h: latest?.volume24h ?? 0,
            lastUpdated: latest?.lastUpdated ?? 0,
            sparkline,
          };
        }),
      );
      return {
        listName: "active-stocks",
        stocks,
      };
    },
  );

  fastify.get<{ Querystring: { symbols?: string } }>("/stream", async (request, reply) => {
    const symbols = parseSymbols(request.query.symbols);

    request.raw.setTimeout(0);
    setSseHeaders(reply);

    incrementConnections();

    const sendPrices = async (): Promise<void> => {
      for (const symbol of symbols) {
        const latest = await readLatestPrice(redis, symbol);
        if (!latest) {
          continue;
        }
        const payload: StreamQuote = toStreamQuote(latest);
        reply.raw.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    };

    await sendPrices();
    const timer = setInterval(() => {
      void sendPrices().catch((err: unknown) => {
        log.error({ err }, "Failed to stream SSE update");
      });
    }, SSE_POLL_INTERVAL_MS);

    request.raw.on("close", () => {
      clearInterval(timer);
      decrementConnections();
    });

    return reply;
  });
}
