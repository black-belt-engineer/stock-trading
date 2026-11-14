import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { candlesQuerySchema, candlesResponseSchema } from "../models/candles.js";
import { resolveSymbol } from "../models/symbols.js";
import { ticksParamsSchema } from "../models/ticks.js";
import type { CandlesService } from "../services/candles.service.js";

export type CandlesRouteDeps = {
  candlesService: CandlesService;
};

/**
 * OHLCV candles aggregated from the stored ticks:
 * `GET /quotes/:symbol/candles?interval=1m|5m|1h|1d&from=&to=&fill=previous|gaps`.
 * Default window: the latest 120 bars; at most 500 per request.
 */
const candlesRoutesImpl: FastifyPluginAsyncTypebox<CandlesRouteDeps> = async (fastify, opts) => {
  const { candlesService } = opts;

  fastify.get(
    "/quotes/:symbol/candles",
    { schema: { params: ticksParamsSchema, querystring: candlesQuerySchema, response: { 200: candlesResponseSchema } } },
    async (request) => {
      // 400 for a malformed symbol, 404 for one not in the registry.
      const { symbol, exchange } = resolveSymbol(request.params.symbol);
      return candlesService.getCandles(symbol, exchange, request.query);
    },
  );
};

export const candlesRoutes = fp(candlesRoutesImpl, { name: "candles-routes" });
