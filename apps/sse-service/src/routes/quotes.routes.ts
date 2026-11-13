import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { resolveSymbol } from "../models/symbols.js";
import type { QuotesService } from "../services/quotes.service.js";

export type QuotesRouteDeps = {
  quotesService: QuotesService;
};

const quotesRoutesImpl: FastifyPluginAsync<QuotesRouteDeps> = async (fastify, opts) => {
  const { quotesService } = opts;

  fastify.get<{ Params: { symbol: string } }>(
    "/quotes/:symbol/snapshot",
    async (request) => {
      // 400 for a malformed symbol, 404 for one not in the registry.
      const { symbol } = resolveSymbol(request.params.symbol);
      return quotesService.getSnapshot(symbol);
    },
  );

  fastify.get("/quotes/discovery/active-stocks", async () => quotesService.getActiveStocks());
};

export const quotesRoutes = fp(quotesRoutesImpl, { name: "quotes-routes" });
