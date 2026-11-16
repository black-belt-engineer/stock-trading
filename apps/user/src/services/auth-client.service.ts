import { AppError } from "@stock-platform/errors";
import { INTERNAL_TOKEN_HEADER } from "@stock-platform/auth-guard";

/** Calls the auth service's internal endpoints, authenticated by the shared internal token. */
export class AuthClientService {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
  ) {}

  /** Ends every session (refresh token) of the user. */
  revokeSessions(userId: string): Promise<void> {
    return this.call("POST", `/internal/users/${encodeURIComponent(userId)}/sessions/revoke`, undefined, "end the sessions");
  }

  /** Stores the user's new name and email with every session, so refreshes return them. */
  updateSessionSummaries(user: { id: string; email: string; name: string }): Promise<void> {
    const body = JSON.stringify({ email: user.email, name: user.name });
    return this.call("PUT", `/internal/users/${encodeURIComponent(user.id)}/sessions/summary`, body, "update the sessions");
  }

  private async call(method: string, path: string, body: string | undefined, action: string): Promise<void> {
    const headers: Record<string, string> = { [INTERNAL_TOKEN_HEADER]: this.internalToken };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), { method, headers, body });
    } catch {
      throw new AppError("Auth service unavailable", 503, "AUTH_SERVICE_UNAVAILABLE");
    }
    if (res.status !== 204) {
      throw new AppError(`Auth service could not ${action}`, 502, "AUTH_SERVICE_ERROR");
    }
  }
}
