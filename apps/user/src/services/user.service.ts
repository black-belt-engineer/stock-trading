import { NotFoundError, UnauthorizedError } from "@stock-platform/errors";
import type { CreateUserBody, UpdateUserBody, User, VerifyCredentialsBody } from "../models/user.js";
import { toUser, type UserRepository } from "../repositories/user.repository.js";
import { hashPassword, verifyPassword } from "./password.js";

export class UserService {
  constructor(private readonly users: UserRepository) {}

  initialize(): Promise<void> {
    return this.users.prepareSchema();
  }

  async list(): Promise<User[]> {
    return (await this.users.findAll()).map(toUser);
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError(`User ${id} not found`);
    }
    return toUser(user);
  }

  async create(body: CreateUserBody): Promise<User> {
    const passwordHash = await hashPassword(body.password);
    return toUser(await this.users.create({ email: body.email, name: body.name, passwordHash }));
  }

  async update(id: string, body: UpdateUserBody): Promise<User> {
    const passwordHash = body.password ? await hashPassword(body.password) : undefined;
    const updated = await this.users.update(id, {
      email: body.email,
      name: body.name,
      passwordHash,
    });
    if (!updated) {
      throw new NotFoundError(`User ${id} not found`);
    }
    return toUser(updated);
  }

  async delete(id: string): Promise<void> {
    if (!(await this.users.delete(id))) {
      throw new NotFoundError(`User ${id} not found`);
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
