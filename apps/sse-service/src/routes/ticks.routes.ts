import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { resolveSymbol } from "../models/symbols.js";
import { ticksCsvQuerySchema, ticksPageSchema, ticksParamsSchema, ticksQuerySchema } from "../models/ticks.js";
import type { TicksService } from "../services/ticks.service.js";

export type TicksRouteDeps = {
  ticksService: TicksService;
};

/**
 * Tick history from Postgres. Both routes take `from` and `to` as ISO-8601
 * date-times with a time zone (default: the last 15 minutes, at most 24 hours).
 */
const ticksRoutesImpl: FastifyPluginAsyncTypebox<TicksRouteDeps> = async (fastify, opts) => {
  const { ticksService } = opts;

  fastify.get(
    "/quotes/:symbol/ticks",
    { schema: { params: ticksParamsSchema, querystring: ticksQuerySchema, response: { 200: ticksPageSchema } } },
    async (request) => {
      // 400 for a malformed symbol, 404 for one not in the registry.
      const { symbol } = resolveSymbol(request.params.symbol);
      return ticksService.getPage(symbol, request.query);
    },
  );

  fastify.get(
    "/quotes/:symbol/ticks.csv",
    { schema: { params: ticksParamsSchema, querystring: ticksCsvQuerySchema } },
    async (request, reply) => {
      const { symbol } = resolveSymbol(request.params.symbol);
      // Validation and the row count happen here, before any header is sent,
      // so a bad request still gets a JSON 400.
      const { filename, body } = await ticksService.exportCsv(symbol, request.query);
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Cache-Control", "no-store")
        .send(body);
    },
  );
};

export const ticksRoutes = fp(ticksRoutesImpl, { name: "ticks-routes" });
