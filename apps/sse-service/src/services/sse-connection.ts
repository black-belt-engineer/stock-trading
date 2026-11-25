import type { Logger } from "@stock-platform/logger";
import { HEARTBEAT_FRAME } from "../models/sse-frames.js";

/** The parts of `ServerResponse` a stream uses (a fake in tests). */
export type SseSocket = {
  write(chunk: string): boolean;
  end(): void;
  destroy(): void;
  once(event: "drain", listener: () => void): unknown;
  readonly writableLength: number;
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
};

export type SseConnectionOptions = {
  log: Logger;
  /** A comment line this often keeps idle proxies and the client's watchdog quiet (S1 step 1). */
  heartbeatMs?: number;
  /** Queued bytes beyond which the client is dropped (owner: 1 MB). */
  maxBufferedBytes?: number;
  /** How long the socket may stay full before the client is dropped (owner: 30 s). */
  maxBehindMs?: number;
  now?: () => number;
};

export const HEARTBEAT_MS = 15_000;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_BEHIND_MS = 30_000;

/**
 * One SSE response: frames, the heartbeat and backpressure.
 *
 * `write` returning false means the socket buffer is full and Node is holding the rest in memory.
 * A client that stays behind (more than 1 MB queued, or no `drain` for 30 s) is dropped rather
 * than skipped, so every client still gets every id in order: it reconnects with its last id and
 * resumes from the hub's buffer, or gets a snapshot.
 */
export class SseConnection {
  private behindSince: number | null = null;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly maxBufferedBytes: number;
  private readonly maxBehindMs: number;
  private readonly now: () => number;

  constructor(
    private readonly socket: SseSocket,
    private readonly options: SseConnectionOptions,
  ) {
    this.maxBufferedBytes = options.maxBufferedBytes ?? MAX_BUFFERED_BYTES;
    this.maxBehindMs = options.maxBehindMs ?? MAX_BEHIND_MS;
    this.now = options.now ?? Date.now;
    this.heartbeat = setInterval(() => this.beat(), options.heartbeatMs ?? HEARTBEAT_MS);
  }

  get closed(): boolean {
    return this.socket.writableEnded || this.socket.destroyed;
  }

  write(frame: string): void {
    if (this.closed) return;
    const flushed = this.socket.write(frame);
    if (!flushed && this.behindSince === null) {
      this.behindSince = this.now();
      this.socket.once("drain", () => {
        this.behindSince = null;
      });
    }
    if (this.socket.writableLength > this.maxBufferedBytes) {
      this.drop("more than the buffer limit is queued");
    }
  }

  /** Writes `finalFrame` (if any) and ends the response normally. */
  end(finalFrame?: string): void {
    this.dispose();
    if (this.closed) return;
    if (finalFrame !== undefined) this.socket.write(finalFrame);
    this.socket.end();
  }

  /** Stops the timers; call when the response closes. */
  dispose(): void {
    clearInterval(this.heartbeat);
  }

  private beat(): void {
    if (this.closed) {
      this.dispose();
      return;
    }
    if (this.behindSince !== null && this.now() - this.behindSince > this.maxBehindMs) {
      this.drop("the socket has not drained");
      return;
    }
    this.write(HEARTBEAT_FRAME);
  }

  private drop(reason: string): void {
    this.options.log.warn(
      { reason, queuedBytes: this.socket.writableLength },
      "Dropping a stream client that cannot keep up",
    );
    this.dispose();
    this.socket.destroy();
  }
}
