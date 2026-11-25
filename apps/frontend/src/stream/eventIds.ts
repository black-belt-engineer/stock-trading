/**
 * The stream's event ids are Redis stream ids, `<milliseconds>-<sequence>` (S1). They are
 * ordered, so the client can tell a tick it already has (a replay overlapping the live stream)
 * from a new one, and sends the newest it saw as `Last-Event-ID` when it reconnects.
 */

export type EventId = { raw: string; ms: bigint; seq: bigint };

const EVENT_ID_PATTERN = /^(\d{1,20})-(\d{1,20})$/;

/** Null for anything that is not a well-formed id (an old server sends none). */
export function parseEventId(value: string): EventId | null {
  const match = EVENT_ID_PATTERN.exec(value);
  const ms = match?.[1];
  const seq = match?.[2];
  if (ms === undefined || seq === undefined) return null;
  return { raw: value, ms: BigInt(ms), seq: BigInt(seq) };
}

/** True when `id` comes after `last` (or there is no `last` yet). */
export function isNewerEventId(id: EventId, last: EventId | null): boolean {
  if (last === null) return true;
  if (id.ms !== last.ms) return id.ms > last.ms;
  return id.seq > last.seq;
}
