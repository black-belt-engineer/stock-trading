import { Type, type Static } from "@sinclair/typebox";

export const loginBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type LoginBody = Static<typeof loginBodySchema>;

/** Without `refreshToken` the token is read from the refresh cookie (browsers). */
export const refreshBodySchema = Type.Object(
  { refreshToken: Type.Optional(Type.String({ minLength: 1 })) },
  { additionalProperties: false },
);
export type RefreshBody = Static<typeof refreshBodySchema>;

export const logoutBodySchema = refreshBodySchema;

export const tokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  /** Only for non-browser clients; a browser gets the refresh token as an `httpOnly` cookie instead. */
  refreshToken: Type.Optional(Type.String()),
  tokenType: Type.Literal("Bearer"),
  /** Access token lifetime in seconds. */
  expiresIn: Type.Integer(),
  user: Type.Object({ id: Type.String(), email: Type.String(), name: Type.String() }),
});
export type TokenResponse = Static<typeof tokenResponseSchema>;

/** What the service issues; the routes decide whether the refresh token goes in the body or a cookie. */
export type IssuedTokens = Omit<TokenResponse, "refreshToken"> & { refreshToken: string };

export const userIdParamsSchema = Type.Object({ id: Type.String({ format: "uuid" }) });

/** The summary the user service sends after a name change; the id comes from the path. */
export const sessionSummaryBodySchema = Type.Object(
  { email: Type.String({ minLength: 1 }), name: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const userSummarySchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
});
export type UserSummary = Static<typeof userSummarySchema>;
