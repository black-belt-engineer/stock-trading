import { isUserId } from "./user-id.js";

/** `user.deleted` from the topic `identity.events`, published by Keycloak's `stock-kafka` listener (K6). */
export type UserDeletedEvent = {
  type: "user.deleted";
  userId: string;
  occurredAt: number;
  source: "self" | "admin";
};

/**
 * Reads one message value. Anything that is not a well-formed `user.deleted` is `null`: other
 * event types may join the topic later (the plan's `user.registered`), and a malformed message
 * must not stop the consumer.
 */
export function parseIdentityEvent(raw: string): UserDeletedEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const type: unknown = Reflect.get(value, "type");
  const userId: unknown = Reflect.get(value, "userId");
  const occurredAt: unknown = Reflect.get(value, "occurredAt");
  const source: unknown = Reflect.get(value, "source");
  if (type !== "user.deleted" || typeof userId !== "string" || !isUserId(userId)) return null;
  return {
    type,
    userId: userId.toLowerCase(),
    occurredAt: typeof occurredAt === "number" && Number.isFinite(occurredAt) ? occurredAt : 0,
    source: source === "admin" ? "admin" : "self",
  };
}
