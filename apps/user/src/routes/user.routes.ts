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
import type { UserService } from "../services/user.service.js";

export type UserRouteDeps = { userService: UserService };

const userRoutesImpl: FastifyPluginAsyncTypebox<UserRouteDeps> = async (fastify, opts) => {
  const { userService } = opts;

  fastify.get("/users", { schema: { response: { 200: Type.Array(userSchema) } } }, () =>
    userService.list(),
  );

  fastify.get(
    "/users/:id",
    { schema: { params: userParamsSchema, response: { 200: userSchema } } },
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
      schema: { params: userParamsSchema, body: updateUserBodySchema, response: { 200: userSchema } },
    },
    (request) => userService.update(request.params.id, request.body),
  );

  fastify.delete(
    "/users/:id",
    { schema: { params: userParamsSchema } },
    async (request, reply) => {
      await userService.delete(request.params.id);
      return reply.code(204).send();
    },
  );

  // Internal: called by the auth service to validate login credentials.
  fastify.post(
    "/users/verify-credentials",
    { schema: { body: verifyCredentialsBodySchema, response: { 200: userSchema } } },
    (request) => userService.verifyCredentials(request.body),
  );
};

export const userRoutes = fp(userRoutesImpl, { name: "user-routes" });
