import { ForbiddenError, UnauthorizedError, ValidationError } from "@stock-platform/errors";
import type { CreateUserBody, UpdateUserBody, User, VerifyCredentialsBody } from "../models/user.js";
import { toUser, type UserRepository } from "../repositories/user.repository.js";
import type { AuthClientService } from "./auth-client.service.js";
import { hashPassword, verifyPassword } from "./password.js";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly authClient: AuthClientService,
  ) {}

  initialize(): Promise<void> {
    return this.users.prepareSchema();
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UnauthorizedError("Account no longer exists");
    }
    return toUser(user);
  }

  async create(body: CreateUserBody): Promise<User> {
    const passwordHash = await hashPassword(body.password);
    return toUser(await this.users.create({ email: body.email, name: body.name, passwordHash }));
  }

  /**
   * Changing the email (the login identifier) or the password needs the current password, and
   * ends every session first. Sessions are revoked before the change: if the auth service is down
   * the request fails with nothing changed, never with a new password and old sessions still alive.
   * The caller's own session ends too and they log in again.
   */
  async update(id: string, body: UpdateUserBody): Promise<User> {
    const { currentPassword, email, name, password } = body;
    if (email === undefined && name === undefined && password === undefined) {
      throw new ValidationError("Nothing to update");
    }

    const existing = await this.users.findById(id);
    if (!existing) {
      throw new UnauthorizedError("Account no longer exists");
    }

    const changesCredentials = email !== undefined || password !== undefined;
    if (changesCredentials) {
      if (currentPassword === undefined) {
        throw new ValidationError("currentPassword is required to change the email or password");
      }
      // 403, not 401: the session is valid, so a client must not refresh or log out on a typo.
      if (!(await verifyPassword(currentPassword, existing.passwordHash))) {
        throw new ForbiddenError("Current password is incorrect");
      }
    }

    const passwordHash = password === undefined ? undefined : await hashPassword(password);
    if (changesCredentials) {
      await this.authClient.revokeSessions(id);
    }
    const updated = await this.users.update(id, { email, name, passwordHash });
    if (!updated) {
      throw new UnauthorizedError("Account no longer exists");
    }
    return toUser(updated);
  }

  /** Ends every session before the row goes, for the same reason as in `update`. */
  async delete(id: string): Promise<void> {
    await this.authClient.revokeSessions(id);
    if (!(await this.users.delete(id))) {
      throw new UnauthorizedError("Account no longer exists");
    }
  }

  /** Used by the auth service; same error for unknown email and wrong password. */
  async verifyCredentials(body: VerifyCredentialsBody): Promise<User> {
    const user = await this.users.findByEmail(body.email);
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new UnauthorizedError("Invalid email or password");
    }
    return toUser(user);
  }
}
