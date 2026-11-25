import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { userIdOf } from "../models/user-id.js";
import { WATCHLIST_LIMIT } from "../models/watchlist.js";
import type { WatchlistService } from "../services/watchlist.service.js";

export type WatchlistRouteDeps = {
  watchlistService: WatchlistService;
};

const SymbolParams = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 16 }) });

const OrderBody = Type.Object(
  {
    symbols: Type.Array(Type.String({ minLength: 1, maxLength: 16 }), { maxItems: WATCHLIST_LIMIT }),
  },
  { additionalProperties: false },
);

/**
 * P1. The user is always the token's subject; no route takes a user id. Writes answer `204`; the
 * client keeps its own optimistic state and reloads the list on window focus.
 * `PUT /portfolio/watchlist/order` is a static route, so it wins over `:symbol` (no symbol is
 * called ORDER).
 */
const watchlistRoutesImpl: FastifyPluginAsyncTypebox<WatchlistRouteDeps> = async (fastify, opts) => {
  const { watchlistService } = opts;

  fastify.get("/portfolio/watchlist", async (request) => watchlistService.list(userIdOf(request)));

  fastify.put("/portfolio/watchlist/order", { schema: { body: OrderBody } }, async (request, reply) => {
    await watchlistService.reorder(userIdOf(request), request.body.symbols);
    return reply.code(204).send();
  });

  fastify.put("/portfolio/watchlist/:symbol", { schema: { params: SymbolParams } }, async (request, reply) => {
    await watchlistService.add(userIdOf(request), request.params.symbol);
    return reply.code(204).send();
  });

  fastify.delete("/portfolio/watchlist/:symbol", { schema: { params: SymbolParams } }, async (request, reply) => {
    await watchlistService.remove(userIdOf(request), request.params.symbol);
    return reply.code(204).send();
  });
};

export const watchlistRoutes = fp(watchlistRoutesImpl, { name: "watchlist-routes" });
