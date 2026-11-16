import { AppError } from "@stock-platform/errors";
import { INTERNAL_TOKEN_HEADER } from "@stock-platform/auth-guard";

/** Calls the auth service's internal endpoints, authenticated by the shared internal token. */
export class AuthClientService {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
  ) {}

  /** Ends every session (refresh token) of the user. */
  async revokeSessions(userId: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(new URL(`/internal/users/${encodeURIComponent(userId)}/sessions/revoke`, this.baseUrl), {
        method: "POST",
        headers: { [INTERNAL_TOKEN_HEADER]: this.internalToken },
      });
    } catch {
      throw new AppError("Auth service unavailable", 503, "AUTH_SERVICE_UNAVAILABLE");
    }
    if (res.status !== 204) {
      throw new AppError("Auth service could not end the sessions", 502, "AUTH_SERVICE_ERROR");
    }
  }
}
