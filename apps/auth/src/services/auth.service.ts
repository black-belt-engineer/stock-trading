import { randomUUID } from "node:crypto";
import { UnauthorizedError } from "@stock-platform/errors";
import { SignJWT, jwtVerify } from "jose";
import type { LoginBody, LoginResponse } from "../models/auth.js";
import type { TokenBlocklistRepository } from "../repositories/token-blocklist.repository.js";
import type { UserClientService } from "./user-client.service.js";

export type AuthServiceOptions = {
  jwtSecret: string;
  expiresInSeconds: number;
};

export class AuthService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly userClient: UserClientService,
    private readonly blocklist: TokenBlocklistRepository,
    private readonly options: AuthServiceOptions,
  ) {
    this.secret = new TextEncoder().encode(options.jwtSecret);
  }

  async login(body: LoginBody): Promise<LoginResponse> {
    const user = await this.userClient.verifyCredentials(body.email, body.password);
    const token = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.options.expiresInSeconds}s`)
      .sign(this.secret);

    return { token, tokenType: "Bearer", expiresIn: this.options.expiresInSeconds, user };
  }

  /** Revokes the token so it can no longer be used, even before it expires. */
  async logout(token: string): Promise<void> {
    const { jti, exp } = await this.verify(token);
    const ttl = exp - Math.floor(Date.now() / 1000);
    await this.blocklist.revoke(jti, ttl);
  }

  /** Verifies signature, expiry and revocation status. */
  async verify(token: string): Promise<{ jti: string; exp: number; sub: string }> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.secret, { algorithms: ["HS256"] }));
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
    const { jti, exp, sub } = payload;
    if (!jti || !exp || !sub) {
      throw new UnauthorizedError("Invalid token");
    }
    if (await this.blocklist.isRevoked(jti)) {
      throw new UnauthorizedError("Token has been revoked");
    }
    return { jti, exp, sub };
  }
}
