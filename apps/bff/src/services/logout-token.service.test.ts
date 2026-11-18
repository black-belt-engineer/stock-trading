import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { InvalidLogoutTokenError, verifyLogoutToken } from "./logout-token.service.js";

const ISSUER = "http://localhost:5173/realms/test";
const EVENT = { "http://schemas.openid.net/event/backchannel-logout": {} };

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
const settings = () => ({ issuer: ISSUER, audience: "stock-bff", keys });

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function sign(claims: Record<string, unknown>, opts: { key?: CryptoKey; alg?: string } = {}) {
  const jwt = new SignJWT({ events: EVENT, ...claims })
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: "k1", typ: "Logout" })
    .setIssuer(ISSUER)
    .setAudience("stock-bff")
    .setIssuedAt()
    .setJti("j1");
  return jwt.sign(opts.key ?? privateKey);
}

describe("verifyLogoutToken", () => {
  it("returns the sid when there is one", async () => {
    const token = await sign({ sid: "s1", sub: "u1" });
    await expect(verifyLogoutToken(token, settings())).resolves.toEqual({ kind: "sid", sid: "s1" });
  });

  it("returns the sub when there is no sid", async () => {
    const token = await sign({ sub: "u1" });
    await expect(verifyLogoutToken(token, settings())).resolves.toEqual({ kind: "sub", sub: "u1" });
  });

  it("rejects a token signed with another key", async () => {
    const token = await sign({ sid: "s1" }, { key: otherKey });
    await expect(verifyLogoutToken(token, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects a wrong issuer and a wrong audience", async () => {
    const token = await sign({ sid: "s1" });
    await expect(verifyLogoutToken(token, { ...settings(), issuer: "http://evil" })).rejects.toBeInstanceOf(InvalidLogoutTokenError);
    await expect(verifyLogoutToken(token, { ...settings(), audience: "other" })).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects a token with a nonce", async () => {
    const token = await sign({ sid: "s1", nonce: "n" });
    await expect(verifyLogoutToken(token, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects a token without the back-channel event", async () => {
    const token = await sign({ sid: "s1", events: {} });
    await expect(verifyLogoutToken(token, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects a token with neither sid nor sub", async () => {
    const token = await sign({});
    await expect(verifyLogoutToken(token, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects an expired token and an unsigned or garbled one", async () => {
    const expired = await new SignJWT({ events: EVENT, sid: "s1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience("stock-bff")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .setJti("j1")
      .sign(privateKey);
    await expect(verifyLogoutToken(expired, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
    await expect(verifyLogoutToken("not-a-jwt", settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sid":"s1"}').toString("base64url")}.`;
    await expect(verifyLogoutToken(unsigned, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("rejects a token without jti", async () => {
    const token = await new SignJWT({ events: EVENT, sid: "s1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience("stock-bff")
      .setIssuedAt()
      .sign(privateKey);
    await expect(verifyLogoutToken(token, settings())).rejects.toBeInstanceOf(InvalidLogoutTokenError);
  });

  it("lets a key-fetch failure through as it is", async () => {
    const token = await sign({ sid: "s1" });
    const failing = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(verifyLogoutToken(token, { ...settings(), keys: failing })).rejects.toBeInstanceOf(TypeError);
  });
});
