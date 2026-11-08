import { UnauthorizedError } from "@stock-platform/errors";
import type { LoginBody, TokenResponse, UserSummary } from "../models/auth.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import type { TokenService } from "./token.service.js";
import type { UserClientService } from "./user-client.service.js";

export class AuthService {
  constructor(
    private readonly userClient: UserClientService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly options: { accessTtlSeconds: number; refreshTtlSeconds: number },
  ) {}

  async login(body: LoginBody): Promise<TokenResponse> {
    const user = await this.userClient.verifyCredentials(body.email, body.password);
    return this.issueTokens(user);
  }

  /** Exchanges a refresh token for a new pair. The old refresh token is invalidated (rotation). */
  async refresh(refreshToken: string): Promise<TokenResponse> {
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

  private async issueTokens(user: UserSummary): Promise<TokenResponse> {
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
