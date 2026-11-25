import { createLogger } from "@stock-platform/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SseConnection, type SseSocket } from "./sse-connection.js";

const log = createLogger("test", { level: "silent" });

class FakeSocket implements SseSocket {
  readonly written: string[] = [];
  writableLength = 0;
  writableEnded = false;
  destroyed = false;
  /** What `write` answers: false means the socket buffer is full. */
  flushes = true;
  private drainListeners: Array<() => void> = [];

  write(chunk: string): boolean {
    this.written.push(chunk);
    if (!this.flushes) this.writableLength += chunk.length;
    return this.flushes;
  }
  end(): void {
    this.writableEnded = true;
  }
  destroy(): void {
    this.destroyed = true;
  }
  once(_event: "drain", listener: () => void): unknown {
    this.drainListeners.push(listener);
    return this;
  }
  drain(): void {
    this.flushes = true;
    this.writableLength = 0;
    for (const listener of this.drainListeners.splice(0)) listener();
  }
}

let now = 0;

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

function open(socket: FakeSocket, maxBufferedBytes = 1000): SseConnection {
  return new SseConnection(socket, { log, heartbeatMs: 15_000, maxBufferedBytes, maxBehindMs: 30_000, now: () => now });
}

describe("SseConnection", () => {
  it("sends a comment heartbeat every 15 s and stops after the end", () => {
    const socket = new FakeSocket();
    const connection = open(socket);
    vi.advanceTimersByTime(15_000);
    expect(socket.written).toEqual([": ping\n\n"]);
    connection.end("event: session-expired\ndata:\n\n");
    vi.advanceTimersByTime(60_000);
    expect(socket.written).toEqual([": ping\n\n", "event: session-expired\ndata:\n\n"]);
    expect(socket.writableEnded).toBe(true);
  });

  it("drops a client with more than the limit queued", () => {
    const socket = new FakeSocket();
    const connection = open(socket, 100);
    socket.flushes = false;
    connection.write("x".repeat(60));
    expect(socket.destroyed).toBe(false);
    connection.write("x".repeat(60));
    expect(socket.destroyed).toBe(true);
    connection.write("more");
    expect(socket.written).toHaveLength(2);
  });

  it("drops a client whose socket has not drained for 30 s", () => {
    const socket = new FakeSocket();
    const connection = open(socket);
    socket.flushes = false;
    connection.write("frame");
    now = 30_000;
    vi.advanceTimersByTime(30_000);
    expect(socket.destroyed).toBe(false);
    now = 45_000;
    vi.advanceTimersByTime(15_000);
    expect(socket.destroyed).toBe(true);
  });

  it("keeps a client that drains in time", () => {
    const socket = new FakeSocket();
    const connection = open(socket);
    socket.flushes = false;
    connection.write("frame");
    now = 20_000;
    socket.drain();
    now = 60_000;
    vi.advanceTimersByTime(60_000);
    expect(socket.destroyed).toBe(false);
  });
});
