import { KindGuard, Type } from "@sinclair/typebox";
import { TypeBoxValidatorCompiler, type FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyRouteSchemaDef } from "fastify/types/schema.js";
import fp from "fastify-plugin";
import { DEFAULT_ORDERS_PAGE, MAX_ORDER_QUANTITY, MAX_ORDERS_PAGE } from "../models/trading.js";
import { userIdOf } from "../models/user-id.js";
import type { TradingService } from "../services/trading.service.js";

export type TradingRouteDeps = {
  tradingService: TradingService;
};

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

/**
 * Strict: checked by TypeBox without Fastify's default coercion, so a quantity sent as `"5"`,
 * `5.5`, `0`, `-1` or `1e9` is `400`, and so is any extra field (a `price` the client might
 * think it can set).
 */
const OrderBody = Type.Object(
  {
    symbol: Type.String({ minLength: 1, maxLength: 16 }),
    side: Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
    quantity: Type.Integer({ minimum: 1, maximum: MAX_ORDER_QUANTITY }),
    clientOrderId: Type.String({ pattern: UUID_PATTERN }),
  },
  { additionalProperties: false },
);

const OrdersQuery = Type.Object({
  limit: Type.Integer({ minimum: 1, maximum: MAX_ORDERS_PAGE, default: DEFAULT_ORDERS_PAGE }),
  before: Type.Optional(Type.String({ pattern: UUID_PATTERN })),
});

/**
 * TypeBox's own checker for one route, in place of Fastify's coercing default. It converts
 * nothing in a body; its errors carry `validation`, so the error handler answers 400.
 */
function strictValidatorCompiler(route: FastifyRouteSchemaDef<unknown>): ReturnType<typeof TypeBoxValidatorCompiler> {
  const { schema } = route;
  if (!KindGuard.IsSchema(schema)) throw new Error(`Not a TypeBox schema: ${route.method} ${route.url}`);
  return TypeBoxValidatorCompiler({ ...route, schema });
}

/** P3. The user is always the token's subject; no route takes a user id. */
const tradingRoutesImpl: FastifyPluginAsyncTypebox<TradingRouteDeps> = async (fastify, opts) => {
  const { tradingService } = opts;

  fastify.get("/portfolio/account", async (request) => tradingService.account(userIdOf(request)));

  fastify.post("/portfolio/account/reset", async (request) => tradingService.reset(userIdOf(request)));

  fastify.get("/portfolio/orders", { schema: { querystring: OrdersQuery } }, async (request) =>
    tradingService.orders(userIdOf(request), request.query.limit, request.query.before?.toLowerCase() ?? null),
  );

  fastify.post(
    "/portfolio/orders",
    { schema: { body: OrderBody }, validatorCompiler: strictValidatorCompiler },
    async (request, reply) => {
      const { order, created } = await tradingService.placeOrder(userIdOf(request), request.body);
      // 201 for a new order, 200 for the original returned to a retry.
      return reply.code(created ? 201 : 200).send(order);
    },
  );
};

export const tradingRoutes = fp(tradingRoutesImpl, { name: "trading-routes" });
