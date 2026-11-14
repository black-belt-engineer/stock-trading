import { ValidationError } from "@stock-platform/errors";
import type { TickCursor } from "./ticks.js";

/** A missing `from` is this long before `to`. */
export const DEFAULT_RANGE_MS = 15 * 60 * 1000;
/** The widest range one request may cover. */
export const MAX_RANGE_MS = 24 * 60 * 60 * 1000;

export type TimeRange = { from: Date; to: Date };

/**
 * The range a tick query covers, `from` inclusive and `to` exclusive.
 * A missing `to` is now and a `to` in the future is clamped to now; a missing
 * `from` is 15 minutes before `to`. Throws 400 when `from` is not before `to`
 * or the range is longer than 24 hours. The strings are already checked as
 * ISO date-times with a time zone by the route schema.
 */
export function resolveTimeRange(rawFrom: string | undefined, rawTo: string | undefined, now: number): TimeRange {
  const requestedTo = rawTo === undefined ? now : Date.parse(rawTo);
  const to = Math.min(requestedTo, now);
  const from = rawFrom === undefined ? to - DEFAULT_RANGE_MS : Date.parse(rawFrom);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new ValidationError("from and to must be ISO-8601 date-times");
  }
  if (from >= to) {
    throw new ValidationError("from must be before to (to is clamped to the current time)");
  }
  if (to - from > MAX_RANGE_MS) {
    throw new ValidationError("The range may not be longer than 24 hours");
  }
  return { from: new Date(from), to: new Date(to) };
}

/** Postgres timestamps as `TickRepository` writes them: UTC with microseconds. */
const CURSOR_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Opaque to clients: base64url of `[time, key]`. */
export function encodeCursor(cursor: TickCursor): string {
  return Buffer.from(JSON.stringify([cursor.time, cursor.key]), "utf8").toString("base64url");
}

/** Throws 400 for anything `encodeCursor` did not produce. */
export function decodeCursor(raw: string): TickCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid cursor");
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new ValidationError("Invalid cursor");
  }
  const [time, key]: unknown[] = parsed;
  if (typeof time !== "string" || !CURSOR_TIME_PATTERN.test(time) || typeof key !== "string" || key === "") {
    throw new ValidationError("Invalid cursor");
  }
  return { time, key };
}
