import { Type, type Static } from "@sinclair/typebox";

export const loginBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type LoginBody = Static<typeof loginBodySchema>;

export const loginResponseSchema = Type.Object({
  token: Type.String(),
  tokenType: Type.Literal("Bearer"),
  expiresIn: Type.Integer(),
  user: Type.Object({ id: Type.String(), email: Type.String(), name: Type.String() }),
});
export type LoginResponse = Static<typeof loginResponseSchema>;

export type UserSummary = { id: string; email: string; name: string };
