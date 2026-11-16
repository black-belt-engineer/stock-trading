import { UnauthorizedError } from "@stock-platform/errors";
import type { IssuedTokens, LoginBody, UserSummary } from "../models/auth.js";
import type { LoginRateLimiter } from "./login-rate-limiter.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import type { TokenService } from "./token.service.js";
import type { UserClientService } from "./user-client.service.js";

export class AuthService {
  constructor(
    private readonly userClient: UserClientService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly loginLimiter: LoginRateLimiter,
    private readonly options: { accessTtlSeconds: number; refreshTtlSeconds: number },
  ) {}

  /** `ip` is the client address for the per-IP limit (see `TRUST_PROXY`). */
  async login(body: LoginBody, ip: string): Promise<IssuedTokens> {
    await this.loginLimiter.beforeAttempt(ip, body.email);
    let user: UserSummary;
    try {
      user = await this.userClient.verifyCredentials(body.email, body.password);
    } catch (error) {
      // Only a wrong email or password is a failure; the user service being down is not.
      if (error instanceof UnauthorizedError) await this.loginLimiter.recordFailure(body.email);
      throw error;
    }
    await this.loginLimiter.recordSuccess(body.email);
    return this.issueTokens(user);
  }

  /** Exchanges a refresh token for a new pair. The old refresh token is invalidated (rotation). */
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const user = await this.refreshTokens.consume(refreshToken);
    if (!user) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
    return this.issueTokens(user);
  }

  /**
   * Ends the session by deleting the refresh token. Already-issued access tokens stay valid
   * until they expire (verification is stateless), hence the short access token lifetime.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.delete(refreshToken);
  }

  /** Revokes every refresh token of a user. Their access tokens still verify until they expire. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private async issueTokens(user: UserSummary): Promise<IssuedTokens> {
    const refreshToken = this.tokens.generateRefreshToken();
    const [accessToken] = await Promise.all([
      this.tokens.signAccessToken(user),
      this.refreshTokens.save(refreshToken, user, this.options.refreshTtlSeconds),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: this.options.accessTtlSeconds,
      user,
    };
  }
}
