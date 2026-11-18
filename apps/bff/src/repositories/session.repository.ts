import { randomBytes } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Redis } from "ioredis";
import type { SessionCrypto } from "../services/session-crypto.js";

const SessionSchema = Type.Object({
  /** Keycloak user id. */
  sub: Type.String(),
  /** Keycloak session id; the back-channel logout names it. */
  sid: Type.String(),
  name: Type.String(),
  email: Type.String(),
  accessToken: Type.String(),
  /** Epoch milliseconds. */
  accessExpiresAt: Type.Number(),
  refreshToken: Type.String(),
  /** Epoch milliseconds. The Redis entry expires at this time. */
  refreshExpiresAt: Type.Number(),
  idToken: Type.String(),
});

export type Session = Static<typeof SessionSchema>;

/**
 * Sessions in Redis. Three kinds of key:
 *   bff:session:<id>         the encrypted session
 *   bff:user-sessions:<sub>  the ids of one user's sessions (logout by user)
 *   bff:sid:<sid>            the session id for one Keycloak session (logout by sid)
 *
 * A Redis error is thrown to the caller, who answers 503.
 */
export class SessionRepository {
  constructor(
    private readonly redis: Redis,
    private readonly crypto: SessionCrypto,
  ) {}

  /** Saves a session under a new random id and returns the id. */
  async create(session: Session): Promise<string> {
    const id = randomBytes(32).toString("base64url");
    await this.save(id, session);
    return id;
  }

  /** Saves a session under an existing id, for example after a token refresh. */
  async save(id: string, session: Session): Promise<void> {
    const key = `bff:session:${id}`;
    const userKey = `bff:user-sessions:${session.sub}`;
    const seconds = Math.max(1, Math.ceil((session.refreshExpiresAt - Date.now()) / 1000));

    await this.redis
      .multi()
      .set(key, this.crypto.encrypt(JSON.stringify(session), key), "EX", seconds)
      .set(`bff:sid:${session.sid}`, id, "EX", seconds)
      .sadd(userKey, id)
      .expire(userKey, seconds)
      .exec();
  }

  /** Returns `undefined` if the session is missing, expired or cannot be read. */
  async get(id: string): Promise<Session | undefined> {
    const key = `bff:session:${id}`;
    const stored = await this.redis.get(key);
    if (stored === null) {
      return undefined;
    }

    const text = this.crypto.decrypt(stored, key);
    if (text === undefined) {
      return undefined;
    }

    try {
      const data: unknown = JSON.parse(text);
      return Value.Check(SessionSchema, data) ? data : undefined;
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<void> {
    const session = await this.get(id);
    const multi = this.redis.multi().del(`bff:session:${id}`);
    if (session) {
      multi.del(`bff:sid:${session.sid}`).srem(`bff:user-sessions:${session.sub}`, id);
    }
    await multi.exec();
  }

  async deleteBySid(sid: string): Promise<void> {
    const id = await this.redis.get(`bff:sid:${sid}`);
    if (id !== null) {
      await this.delete(id);
    }
  }

  async deleteBySub(sub: string): Promise<void> {
    const ids = await this.redis.smembers(`bff:user-sessions:${sub}`);
    for (const id of ids) {
      await this.delete(id);
    }
  }
}
