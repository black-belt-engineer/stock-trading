import { Type, type Static } from "@sinclair/typebox";

export const loginBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type LoginBody = Static<typeof loginBodySchema>;

export const refreshBodySchema = Type.Object(
  { refreshToken: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type RefreshBody = Static<typeof refreshBodySchema>;

export const logoutBodySchema = refreshBodySchema;

export const tokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  tokenType: Type.Literal("Bearer"),
  /** Access token lifetime in seconds. */
  expiresIn: Type.Integer(),
  user: Type.Object({ id: Type.String(), email: Type.String(), name: Type.String() }),
});
export type TokenResponse = Static<typeof tokenResponseSchema>;

export type UserSummary = { id: string; email: string; name: string };
