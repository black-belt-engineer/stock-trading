/**
 * Redis stream entry ids, `<milliseconds>-<sequence>`. They are ordered, unique per stream and
 * come from Redis, not from this process, so an id a client got from one instance means the same
 * on any other (S1 resume across instances).
 */

export type StreamId = {
  /** The id as Redis wrote it. */
  raw: string;
  ms: bigint;
  seq: bigint;
};

/** Both parts are unsigned 64-bit integers in Redis: at most 20 digits each. */
const STREAM_ID_PATTERN = /^(\d{1,20})-(\d{1,20})$/;

/**
 * Parses an id, or returns null for anything that is not exactly `<digits>-<digits>`.
 * `Last-Event-ID` is client-controlled, so it goes through here before it is used.
 */
export function parseStreamId(value: string): StreamId | null {
  const match = STREAM_ID_PATTERN.exec(value);
  const ms = match?.[1];
  const seq = match?.[2];
  if (ms === undefined || seq === undefined) return null;
  return { raw: value, ms: BigInt(ms), seq: BigInt(seq) };
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. */
export function compareStreamIds(a: StreamId, b: StreamId): number {
  if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
  if (a.seq !== b.seq) return a.seq < b.seq ? -1 : 1;
  return 0;
}

/** The entry's time in epoch milliseconds (Redis's clock when it was added). */
export function streamIdTime(id: StreamId): number {
  return Number(id.ms);
}

/** The `Last-Event-ID` request header, or null when it is missing, repeated or malformed. */
export function lastEventIdFromHeader(header: string | string[] | undefined): StreamId | null {
  if (typeof header !== "string") return null;
  return parseStreamId(header.trim());
}
