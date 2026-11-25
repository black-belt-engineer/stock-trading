import type { Redis } from "ioredis";

/** One raw entry: its id and the flat `[field, value, …]` list Redis returns. */
export type RawStreamEntry = { id: string; fields: string[] };

/**
 * The hub's view of the Redis stream, so it can be tested without Redis. One reader is one
 * connection, used only for this stream: a blocking read holds its connection.
 */
export type StreamReader = {
  /** The newest `count` entries, oldest first. Empty when the stream does not exist. */
  readLatest(count: number): Promise<RawStreamEntry[]>;
  /** Waits up to `blockMs` for entries after `afterId`, oldest first; empty on timeout. */
  readAfter(afterId: string, blockMs: number, count: number): Promise<RawStreamEntry[]>;
  /** Called with `false` when the connection drops and `true` once it is usable again. */
  onConnectionChange(listener: (connected: boolean) => void): void;
  /** Closes the connection at once, failing a read in flight. */
  close(): void;
};

/** Reads `key` on its own duplicate of `redis`, so ordinary commands on the main connection are never stalled. */
export function createRedisStreamReader(redis: Redis, key: string): StreamReader {
  const connection = redis.duplicate({ connectionName: "sse-stream-reader" });
  // Without a handler ioredis logs every failed reconnect as an unhandled error event; the hub
  // logs the read errors and tracks the state through `onConnectionChange`.
  connection.on("error", () => {});

  return {
    async readLatest(count) {
      const entries = await connection.xrevrange(key, "+", "-", "COUNT", count);
      return entries.map(([id, fields]) => ({ id, fields })).reverse();
    },
    async readAfter(afterId, blockMs, count) {
      const response = await connection.xread("COUNT", count, "BLOCK", blockMs, "STREAMS", key, afterId);
      const entries: RawStreamEntry[] = [];
      for (const [, messages] of response ?? []) {
        for (const [id, fields] of messages) entries.push({ id, fields });
      }
      return entries;
    },
    onConnectionChange(listener) {
      connection.on("ready", () => listener(true));
      connection.on("close", () => listener(false));
    },
    close() {
      connection.disconnect();
    },
  };
}
