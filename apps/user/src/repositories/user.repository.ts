import type { Pool } from "pg";
import { ConflictError } from "@stock-platform/errors";
import type { User, UserRecord } from "../models/user.js";

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = "id, email, name, password_hash, created_at, updated_at";

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toUser({ passwordHash: _omit, ...user }: UserRecord): User {
  return user;
}

function rethrowUniqueViolation(err: unknown): never {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    throw new ConflictError("A user with this email already exists");
  }
  throw err;
}

export class UserRepository {
  constructor(private readonly db: Pool) {}

  async prepareSchema(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.db.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (lower(email));`);
  }

  async findAll(): Promise<UserRecord[]> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY created_at`);
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async create(input: { email: string; name: string; passwordHash: string }): Promise<UserRecord> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
        [input.email, input.name, input.passwordHash],
      );
      const row = rows[0];
      if (!row) {
        throw new Error("INSERT INTO users … RETURNING returned no row");
      }
      return toRecord(row);
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async update(
    id: string,
    patch: { email?: string; name?: string; passwordHash?: string },
  ): Promise<UserRecord | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `UPDATE users SET
           email = COALESCE($2, email),
           name = COALESCE($3, name),
           password_hash = COALESCE($4, password_hash),
           updated_at = now()
         WHERE id = $1
         RETURNING ${COLUMNS}`,
        [id, patch.email ?? null, patch.name ?? null, patch.passwordHash ?? null],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM users WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
