import type * as client from "openid-client";
import { describe, expect, it } from "vitest";
import { LoginRejectedError, sessionFromTokens } from "./callback.service.js";

const tokens: client.TokenEndpointResponse = {
  access_token: "access",
  token_type: "bearer",
  refresh_token: "refresh",
  id_token: "id",
  expires_in: 600,
  refresh_expires_in: 1800,
};
const claims: client.IDToken = { iss: "i", aud: "a", exp: 1, iat: 1, sub: "u1", sid: "s1", name: "Ada", email: "a@b.c" };

describe("sessionFromTokens", () => {
  it("takes the user from the ID token and the expiry from the response", () => {
    expect(sessionFromTokens(tokens, claims, 1000)).toEqual({
      sub: "u1",
      sid: "s1",
      name: "Ada",
      email: "a@b.c",
      accessToken: "access",
      accessExpiresAt: 601_000,
      refreshToken: "refresh",
      refreshExpiresAt: 1_801_000,
      idToken: "id",
    });
  });

  it("falls back to the access lifetime without refresh_expires_in", () => {
    const { refresh_expires_in: _omitted, ...rest } = tokens;
    expect(sessionFromTokens(rest, claims, 0).refreshExpiresAt).toBe(600_000);
  });

  it("rejects a response without a refresh token or a sid", () => {
    const { refresh_token: _omitted, ...rest } = tokens;
    expect(() => sessionFromTokens(rest, claims, 0)).toThrow(LoginRejectedError);
    const { sid: _sid, ...noSid } = claims;
    expect(() => sessionFromTokens(tokens, noSid, 0)).toThrow(LoginRejectedError);
  });
});
