import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import fp from "fastify-plugin";
import {
  createUserBodySchema,
  updateUserBodySchema,
  userParamsSchema,
  userSchema,
  verifyCredentialsBodySchema,
} from "../models/user.js";
import type { JwtGuard } from "../plugins/jwt-guard.js";
import type { UserService } from "../services/user.service.js";

export type UserRouteDeps = { userService: UserService; jwtGuard: JwtGuard };

const userRoutesImpl: FastifyPluginAsyncTypebox<UserRouteDeps> = async (fastify, opts) => {
  const { userService, jwtGuard } = opts;

  fastify.get("/users", { preHandler: jwtGuard, schema: { response: { 200: Type.Array(userSchema) } } }, () =>
    userService.list(),
  );

  fastify.get(
    "/users/:id",
    { preHandler: jwtGuard, schema: { params: userParamsSchema, response: { 200: userSchema } } },
    (request) => userService.getById(request.params.id),
  );

  fastify.post(
    "/users",
    { schema: { body: createUserBodySchema, response: { 201: userSchema } } },
    async (request, reply) => reply.code(201).send(await userService.create(request.body)),
  );

  fastify.patch(
    "/users/:id",
    {
      preHandler: jwtGuard,
      schema: { params: userParamsSchema, body: updateUserBodySchema, response: { 200: userSchema } },
    },
    (request) => userService.update(request.params.id, request.body),
  );

  fastify.delete(
    "/users/:id",
    { preHandler: jwtGuard, schema: { params: userParamsSchema } },
    async (request, reply) => {
      await userService.delete(request.params.id);
      return reply.code(204).send();
    },
  );

  // Public (no guard): auth calls this to log in, before any token exists. Not for external exposure.
  // Internal: called by the auth service to validate login credentials.
  fastify.post(
    "/users/verify-credentials",
    { schema: { body: verifyCredentialsBodySchema, response: { 200: userSchema } } },
    (request) => userService.verifyCredentials(request.body),
  );
};

export const userRoutes = fp(userRoutesImpl, { name: "user-routes" });
