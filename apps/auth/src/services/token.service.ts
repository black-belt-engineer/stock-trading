import { createPrivateKey, createPublicKey, randomBytes, randomUUID, type KeyObject } from "node:crypto";
import { SignJWT, calculateJwkThumbprint, exportJWK, type JWK } from "jose";
import type { UserSummary } from "../models/auth.js";

const ALG = "ES256";

export type TokenServiceOptions = {
  privateKeyPem: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
};

/** Signs access tokens with the private key and publishes the public key as a JWKS. */
export class TokenService {
  private constructor(
    private readonly privateKey: KeyObject,
    private readonly kid: string,
    private readonly publicJwk: JWK,
    private readonly options: TokenServiceOptions,
  ) {}

  static async create(options: TokenServiceOptions): Promise<TokenService> {
    const privateKey = createPrivateKey(options.privateKeyPem.replaceAll("\\n", "\n"));
    const jwk = await exportJWK(createPublicKey(privateKey));
    const kid = await calculateJwkThumbprint(jwk);
    return new TokenService(privateKey, kid, { ...jwk, kid, alg: ALG, use: "sig" }, options);
  }

  getJwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  signAccessToken(user: UserSummary): Promise<string> {
    return new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: ALG, kid: this.kid })
      .setSubject(user.id)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.options.accessTtlSeconds}s`)
      .sign(this.privateKey);
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }
}
