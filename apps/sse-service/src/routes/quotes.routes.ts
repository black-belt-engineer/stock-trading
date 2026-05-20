import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { QuotesService } from "../services/quotes.service.js";

const quotesRoutesImpl: FastifyPluginAsync = async (fastify) => {
  const quotesService = new QuotesService(fastify.redis);

  fastify.get<{ Params: { symbol: string } }>(
    "/quotes/:symbol/snapshot",
    async (request) => {
      const symbol = request.params.symbol.toUpperCase();
      return quotesService.getSnapshot(symbol);
    },
  );

  fastify.get("/quotes/discovery/active-stocks", async () => quotesService.getActiveStocks());
};

export const quotesRoutes = fp(quotesRoutesImpl, { name: "quotes-routes" });
