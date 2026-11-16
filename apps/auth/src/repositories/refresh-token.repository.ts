import { createHash } from "node:crypto";
import type { ChainableCommander, Redis } from "ioredis";
import { Value } from "@sinclair/typebox/value";
import { userSummarySchema, type UserSummary } from "../models/auth.js";

// Only a hash of the opaque token is stored, so a Redis leak does not expose usable tokens.
const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const tokenKey = (hash: string): string => `auth:refresh:${hash}`;
// Per-user index of token hashes, so every session of a user can be revoked at once.
const userSessionsKey = (userId: string): string => `auth:user-sessions:${userId}`;

/** A stored entry that is not valid JSON or not a user counts as an unknown token. */
function parseSummary(value: string | null): UserSummary | null {
  if (!value) return null;
  let user: unknown;
  try {
    user = JSON.parse(value);
  } catch {
    return null;
  }
  return Value.Check(userSummarySchema, user) ? user : null;
}

/** ioredis reports a failed command inside a transaction in its result, not by rejecting. */
async function execOrThrow(transaction: ChainableCommander): Promise<void> {
  const results = await transaction.exec();
  if (!results) {
    throw new Error("Redis transaction was aborted");
  }
  for (const [err] of results) {
    if (err) throw err;
  }
}

export class RefreshTokenRepository {
  constructor(private readonly redis: Redis) {}

  async save(token: string, user: UserSummary, ttlSeconds: number): Promise<void> {
    const hash = hashToken(token);
    const sessions = userSessionsKey(user.id);
    // The index lives as long as the newest token; hashes of expired tokens in it are harmless.
    await execOrThrow(
      this.redis
        .multi()
        .set(tokenKey(hash), JSON.stringify(user), "EX", ttlSeconds)
        .sadd(sessions, hash)
        .expire(sessions, ttlSeconds),
    );
  }

  /** Atomically reads and deletes the token (single use, enables rotation). */
  async consume(token: string): Promise<UserSummary | null> {
    const hash = hashToken(token);
    const user = parseSummary(await this.redis.getdel(tokenKey(hash)));
    if (user) {
      await this.redis.srem(userSessionsKey(user.id), hash);
    }
    return user;
  }

  /** Logout: removes the token and its index entry. */
  async delete(token: string): Promise<void> {
    await this.consume(token);
  }

  /**
   * Ends every session of a user (account deleted, password or email changed).
   * Not atomic with a concurrent login: a token saved between SMEMBERS and DEL keeps working
   * until it expires. A Lua script would close that window.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const sessions = userSessionsKey(userId);
    const hashes = await this.redis.smembers(sessions);
    await this.redis.del(sessions, ...hashes.map(tokenKey));
  }
}
