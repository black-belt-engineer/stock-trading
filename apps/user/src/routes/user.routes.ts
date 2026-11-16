import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ForbiddenError, UnauthorizedError } from "@stock-platform/errors";
import fp from "fastify-plugin";
import {
  createUserBodySchema,
  updateUserBodySchema,
  userParamsSchema,
  userSchema,
  verifyCredentialsBodySchema,
} from "../models/user.js";
import type { InternalGuard, JwtGuard } from "@stock-platform/auth-guard";
import type { UserService } from "../services/user.service.js";

export type UserRouteDeps = { userService: UserService; jwtGuard: JwtGuard; internalGuard: InternalGuard };

/** The caller's id from the JWT guard. Only `sub` is used for authorisation, never the email claim. */
function callerId(authUserId: string | undefined): string {
  if (!authUserId) {
    throw new UnauthorizedError("Missing authenticated user");
  }
  return authUserId;
}

/**
 * Allows a request only on the caller's own account. Runs before any lookup, so the answer is
 * `403` whether or not the target exists and does not reveal which ids are taken.
 */
function requireSelf(authUserId: string | undefined, targetId: string): string {
  const id = callerId(authUserId);
  if (id !== targetId) {
    throw new ForbiddenError("You can only access your own account");
  }
  return id;
}

const userRoutesImpl: FastifyPluginAsyncTypebox<UserRouteDeps> = async (fastify, opts) => {
  const { userService, jwtGuard, internalGuard } = opts;

  fastify.get("/users/me", { preHandler: jwtGuard, schema: { response: { 200: userSchema } } }, (request) =>
    userService.getById(callerId(request.authUserId)),
  );

  fastify.get(
    "/users/:id",
    { preHandler: jwtGuard, schema: { params: userParamsSchema, response: { 200: userSchema } } },
    (request) => userService.getById(requireSelf(request.authUserId, request.params.id)),
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
    (request) => userService.update(requireSelf(request.authUserId, request.params.id), request.body),
  );

  fastify.delete(
    "/users/:id",
    { preHandler: jwtGuard, schema: { params: userParamsSchema } },
    async (request, reply) => {
      await userService.delete(requireSelf(request.authUserId, request.params.id));
      return reply.code(204).send();
    },
  );

  // Internal: the auth service calls this to log in, before any token exists. It proves itself
  // with the shared internal token instead of a user JWT.
  fastify.post(
    "/users/verify-credentials",
    { preHandler: internalGuard, schema: { body: verifyCredentialsBodySchema, response: { 200: userSchema } } },
    (request) => userService.verifyCredentials(request.body),
  );
};

export const userRoutes = fp(userRoutesImpl, { name: "user-routes" });
