import { AppError, UnauthorizedError } from "@stock-platform/errors";
import { Value } from "@sinclair/typebox/value";
import { userSummarySchema, type UserSummary } from "../models/auth.js";

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
      ? body.code
      : undefined;
  } catch {
    return undefined;
  }
}

export class UserClientService {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
  ) {}

  async verifyCredentials(email: string, password: string): Promise<UserSummary> {
    let res: Response;
    try {
      res = await fetch(new URL("/users/verify-credentials", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": this.internalToken },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new AppError("User service unavailable", 503, "USER_SERVICE_UNAVAILABLE");
    }
    if (res.status === 401) {
      // A rejected service secret is a misconfiguration, not a wrong password: never show it as one.
      if ((await errorCode(res)) === "INTERNAL_AUTH_FAILED") {
        throw new AppError("User service rejected the internal token", 502, "USER_SERVICE_ERROR");
      }
      throw new UnauthorizedError("Invalid email or password");
    }
    if (!res.ok) {
      throw new AppError("User service error", 502, "USER_SERVICE_ERROR");
    }
    let user: unknown;
    try {
      user = await res.json();
    } catch {
      throw new AppError("User service sent invalid JSON", 502, "USER_SERVICE_ERROR");
    }
    if (!Value.Check(userSummarySchema, user)) {
      throw new AppError("User service sent an unexpected response", 502, "USER_SERVICE_ERROR");
    }
    return { id: user.id, email: user.email, name: user.name };
  }
}
