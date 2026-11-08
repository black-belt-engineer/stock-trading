import { AppError, UnauthorizedError } from "@stock-platform/errors";
import type { UserSummary } from "../models/auth.js";

export class UserClientService {
  constructor(private readonly baseUrl: string) {}

  async verifyCredentials(email: string, password: string): Promise<UserSummary> {
    let res: Response;
    try {
      res = await fetch(new URL("/users/verify-credentials", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new AppError("User service unavailable", 503, "USER_SERVICE_UNAVAILABLE");
    }
    if (res.status === 401) {
      throw new UnauthorizedError("Invalid email or password");
    }
    if (!res.ok) {
      throw new AppError("User service error", 502, "USER_SERVICE_ERROR");
    }
    const user = (await res.json()) as UserSummary;
    return { id: user.id, email: user.email, name: user.name };
  }
}
