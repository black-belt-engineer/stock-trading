import { Type, type Static } from "@sinclair/typebox";

export const userSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  email: Type.String(),
  name: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type User = Static<typeof userSchema>;

/** Row including the password hash; never serialized to clients. */
export type UserRecord = User & { passwordHash: string };

export const createUserBodySchema = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 254 }),
    name: Type.String({ minLength: 1, maxLength: 100 }),
    password: Type.String({ minLength: 8, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type CreateUserBody = Static<typeof createUserBodySchema>;

export const updateUserBodySchema = Type.Object(
  {
    email: Type.Optional(Type.String({ format: "email", maxLength: 254 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    password: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateUserBody = Static<typeof updateUserBodySchema>;

export const verifyCredentialsBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type VerifyCredentialsBody = Static<typeof verifyCredentialsBodySchema>;

export const userParamsSchema = Type.Object({ id: Type.String({ format: "uuid" }) });
