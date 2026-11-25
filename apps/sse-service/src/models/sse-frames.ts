import type { StreamQuote } from "@stock-platform/types";

/**
 * The SSE frames the stream writes. Each ends with the blank line that dispatches it.
 * Only `price` carries an `id:`: it is the Redis stream id the client sends back as
 * `Last-Event-ID`. A snapshot is current state, not a stream entry, so it has none.
 */

export function priceFrame(id: string, quote: StreamQuote): string {
  return `id: ${id}\nevent: price\ndata: ${JSON.stringify(quote)}\n\n`;
}

export function snapshotFrame(quote: StreamQuote): string {
  return `event: snapshot\ndata: ${JSON.stringify(quote)}\n\n`;
}

export const SESSION_EXPIRED_FRAME = "event: session-expired\ndata:\n\n";

/** A comment line: parsers ignore it, but it keeps proxies and the client's watchdog from timing out. */
export const HEARTBEAT_FRAME = ": ping\n\n";

/** The reconnect delay hint, for clients that honour it (`EventSource`); ours has its own backoff. */
export function retryFrame(ms: number): string {
  return `retry: ${ms}\n\n`;
}
