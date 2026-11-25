import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import { PRICE_PATTERN } from "../models/alert.js";
import { userIdOf } from "../models/user-id.js";
import type { AlertService } from "../services/alert.service.js";

export type AlertRouteDeps = {
  alertService: AlertService;
};

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const IdParams = Type.Object({ id: Type.String({ pattern: UUID_PATTERN }) });

/** Amounts are decimal strings (see `PRICE_PATTERN`). */
const Amount = Type.String({ pattern: PRICE_PATTERN });

const CreateBody = Type.Object(
  {
    symbol: Type.String({ minLength: 1, maxLength: 16 }),
    direction: Type.Union([Type.Literal("above"), Type.Literal("below")]),
    threshold: Amount,
  },
  { additionalProperties: false },
);

const TriggerBody = Type.Object({ price: Amount }, { additionalProperties: false });

/**
 * P2. The user is always the token's subject; no route takes a user id, and an id that belongs to
 * someone else behaves exactly like one that does not exist.
 */
const alertRoutesImpl: FastifyPluginAsyncTypebox<AlertRouteDeps> = async (fastify, opts) => {
  const { alertService } = opts;

  fastify.get("/portfolio/alerts", async (request) => alertService.list(userIdOf(request)));

  fastify.post("/portfolio/alerts", { schema: { body: CreateBody } }, async (request, reply) => {
    const alert = await alertService.create(userIdOf(request), request.body);
    return reply.code(201).send(alert);
  });

  fastify.delete("/portfolio/alerts/:id", { schema: { params: IdParams } }, async (request, reply) => {
    await alertService.remove(userIdOf(request), request.params.id.toLowerCase());
    return reply.code(204).send();
  });

  fastify.post(
    "/portfolio/alerts/:id/trigger",
    { schema: { params: IdParams, body: TriggerBody } },
    async (request) => alertService.trigger(userIdOf(request), request.params.id.toLowerCase(), request.body.price),
  );
};

export const alertRoutes = fp(alertRoutesImpl, { name: "alert-routes" });
