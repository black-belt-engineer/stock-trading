/**
 * Which trading session a moment belongs to. Day values (open, high, low,
 * volume, previous close) are kept per session, so this is the one place that
 * decides where a day starts and ends.
 *
 * While prices are simulated the market trades around the clock and a session
 * is one UTC calendar day (README Q3), on every exchange. A real feed replaces
 * this with exchange hours, holidays and half days; callers stay as they are.
 */

const DAY_MS = 86_400_000;

/** Session key for `timestamp` (epoch ms) on `exchange`, such as `2026-11-12`. Derive it from the event time, never the processing time. */
export function sessionIdFor(timestamp: number, exchange: string): string {
  return new Date(sessionStartFor(timestamp, exchange)).toISOString().slice(0, 10);
}

/** Start of the session that contains `timestamp` (epoch ms), in epoch ms. */
export function sessionStartFor(timestamp: number, _exchange: string): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

/** End (exclusive) of the session that contains `timestamp`, which is also the start of the next one, in epoch ms. */
export function sessionEndFor(timestamp: number, exchange: string): number {
  return sessionStartFor(timestamp, exchange) + DAY_MS;
}
