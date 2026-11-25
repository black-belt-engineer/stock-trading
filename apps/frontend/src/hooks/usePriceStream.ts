import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, LoggedOutError } from "../api";
import { isNewerEventId, parseEventId, type EventId } from "../stream/eventIds";
import { createEventStreamParser, type StreamEvent } from "../stream/eventStream";
import type { FeedEvent, LiveQuote } from "../types";
import { finiteOrNull, isRecord, parseDayValues, parseTickDirection } from "../utils/guards";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "disconnected";

const BACKOFF = [500, 1000, 2000, 4000, 8000, 16000];
/** The wait once BACKOFF is used up. */
const MAX_BACKOFF_MS = 30000;

/**
 * The server writes a `: ping` comment every 15 s (S1), so a connection that has
 * delivered no bytes at all for this long is dead even without an `error` (a laptop
 * waking from sleep, lost Wi-Fi). It is then dropped and resumed. With the ingestor
 * alone down the heartbeats keep the connection open: the cards say "Delayed".
 */
const HEARTBEAT_TIMEOUT_MS = 35_000;

/**
 * How many recent trades the hook keeps, newest first, across all symbols. Only a
 * memory bound: the Live Feed decides how many rows to show (D2). It is large so
 * that a feed filtered to one symbol still finds its rows (18 symbols tick about
 * once a second each, so this is close to two minutes of trades), and so that a
 * paused feed can count what arrived meanwhile.
 */
export const FEED_BUFFER_LIMIT = 2000;

/** Returns null for a malformed message so one bad frame cannot throw inside a listener. */
function parseQuote(raw: string): LiveQuote | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.symbol !== "string" || data.symbol === "") {
    return null;
  }
  // Without a price or a server time a quote cannot be shown or ordered.
  const price = finiteOrNull(data.price);
  const timestamp = finiteOrNull(data.timestamp);
  if (price === null || timestamp === null) return null;
  return {
    symbol: data.symbol,
    name: typeof data.name === "string" && data.name !== "" ? data.name : data.symbol,
    price,
    ...parseDayValues(data),
    tickDirection: parseTickDirection(data.tickDirection),
    quantity: finiteOrNull(data.quantity) ?? 0,
    side: data.side === "sell" ? "sell" : "buy",
    timestamp,
  };
}

/**
 * The price stream, read with `fetch` through the BFF, which adds the access token
 * to the upstream request (the page holds none).
 *
 * How a connection ends decides what happens next:
 * - `401` (the BFF has no session, or Keycloak refused the renewal): logged out,
 *   stop, no retry.
 * - `502` or `503` (the BFF or Keycloak is down), a network error, or a body that
 *   ends without explanation: a dropped connection, retried with backoff.
 * - `event: session-expired` before the end: the access token ran out. The BFF
 *   renews it on the next request, so reconnect at once, with no backoff and no
 *   status change.
 *
 * Every reconnect sends the id of the newest `price` event seen as `Last-Event-ID`
 * (S1). The server then replays what was missed, or sends a fresh `snapshot` when it
 * no longer can. Replayed trades are real trades: they go into the feed like live
 * ones, so History's live view and the chart have no gap. A tick whose id is not
 * newer than the last one seen is a duplicate and is dropped. The ids are per
 * symbol set: a new set (or a new login, which remounts the provider) starts fresh.
 *
 * Opens no connection while `symbols` is null or empty.
 */
export function usePriceStream(symbols: string[] | null): {
  prices: Map<string, LiveQuote>;
  feed: FeedEvent[];
  status: StreamStatus;
  reconnectAttempts: number;
  /** When the next reconnect attempt is scheduled (epoch ms), or null when none is pending. */
  nextRetryAt: number | null;
  /** Skips the remaining backoff and reconnects now. */
  retry: () => void;
} {
  const [prices, setPrices] = useState<Map<string, LiveQuote>>(new Map());
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const retriesRef = useRef(0);
  /** Aborts the current connection's fetch, or null when none is open. */
  const connectionRef = useRef<AbortController | null>(null);
  /** The current connection has answered 200 and its body is being read. */
  const openRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lastMessageRef = useRef(0);
  /** Set by the effect below; reconnects immediately. A no-op before mount and after unmount. */
  const retryRef = useRef<() => void>(() => {});

  const query = useMemo(() => symbols?.join(",") ?? "", [symbols]);

  useEffect(() => {
    if (query === "") return;
    let mounted = true;
    let loggedOut = false;
    /** The newest `price` event id seen, sent back on reconnect. */
    let lastSeenId: EventId | null = null;
    /** Events of one body chunk, applied together: a replay burst is one render, not hundreds. */
    let pendingQuotes: LiveQuote[] = [];
    let pendingTrades: FeedEvent[] = [];

    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setNextRetryAt(null);
    };

    const closeConnection = (): void => {
      openRef.current = false;
      if (connectionRef.current) {
        connectionRef.current.abort();
        connectionRef.current = null;
      }
    };

    const scheduleReconnect = (): void => {
      closeConnection();
      if (!mounted || loggedOut) return;
      setStatus("reconnecting");
      const delay = BACKOFF[retriesRef.current] ?? MAX_BACKOFF_MS;
      retriesRef.current += 1;
      setReconnectAttempts(retriesRef.current);
      setNextRetryAt(Date.now() + delay);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setNextRetryAt(null);
        connect();
      }, delay);
    };

    /** No session: stop for good, without backoff. The route guard sends the user to the login. */
    const stopLoggedOut = (): void => {
      loggedOut = true;
      clearTimer();
      closeConnection();
      if (mounted) setStatus("disconnected");
    };

    const flushPending = (): void => {
      const quotes = pendingQuotes;
      const trades = pendingTrades;
      pendingQuotes = [];
      pendingTrades = [];
      if (quotes.length > 0) {
        setPrices((prev) => {
          const next = new Map(prev);
          for (const quote of quotes) next.set(quote.symbol, quote);
          return next;
        });
      }
      if (trades.length > 0) {
        // The feed is newest first; `trades` is in arrival order.
        setFeed((prev) => [...trades.reverse(), ...prev].slice(0, FEED_BUFFER_LIMIT));
      }
    };

    const handleEvent = (event: StreamEvent): void => {
      // Current state, not trades: sent at connect when there is nothing to resume from,
      // and after the server's reader reconnected. Prices only, never the feed.
      if (event.type === "snapshot") {
        const quote = parseQuote(event.data);
        if (quote) pendingQuotes.push(quote);
        return;
      }
      if (event.type !== "price") return;
      const safeData = parseQuote(event.data);
      if (!safeData) return;

      const eventId = parseEventId(event.lastEventId);
      if (eventId) {
        if (!isNewerEventId(eventId, lastSeenId)) return;
        lastSeenId = eventId;
      }
      pendingQuotes.push(safeData);
      pendingTrades.push({
        ...safeData,
        type: "trade",
        // A server without ids (older than S1) still gets unique keys.
        id: eventId?.raw ?? `${safeData.symbol}-${safeData.timestamp}-${Math.random().toString(16).slice(2)}`,
      });
    };

    /**
     * One connection: open it through the API client, then read the body until it ends. Only the current connection may
     * change the status or schedule a reconnect.
     */
    const run = async (controller: AbortController): Promise<void> => {
      const isCurrent = (): boolean => mounted && connectionRef.current === controller;
      let sessionExpired = false;
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (lastSeenId) headers["Last-Event-ID"] = lastSeenId.raw;
        const response = await apiFetch(`/stream?symbols=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers,
        });
        if (!isCurrent()) return;
        if (!response.ok || !response.body) {
          scheduleReconnect();
          return;
        }

        retriesRef.current = 0;
        lastMessageRef.current = Date.now();
        openRef.current = true;
        setReconnectAttempts(0);
        setStatus("live");

        const parser = createEventStreamParser((event) => {
          if (!isCurrent()) return;
          if (event.type === "session-expired") {
            sessionExpired = true;
            return;
          }
          handleEvent(event);
        });
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Any bytes count, heartbeats included.
          lastMessageRef.current = Date.now();
          parser.push(value);
          if (isCurrent()) flushPending();
        }
        parser.end();
        if (isCurrent()) flushPending();
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof LoggedOutError) {
          stopLoggedOut();
          return;
        }
        // A network error or a dropped connection.
        scheduleReconnect();
        return;
      }

      if (!isCurrent()) return;
      if (!sessionExpired) {
        // The body ended without the server saying why.
        scheduleReconnect();
        return;
      }
      // The BFF renews the token on this request (a refused renewal answers 401, which
      // `run` reads as a logout). Reconnect at once, keeping the status, so no
      // "Connection lost" banner appears.
      openRef.current = false;
      connect({ keepStatus: true });
    };

    const connect = (options: { keepStatus?: boolean } = {}): void => {
      if (!mounted || loggedOut) return;
      if (!options.keepStatus) setStatus(retriesRef.current > 0 ? "reconnecting" : "connecting");
      closeConnection();
      const controller = new AbortController();
      connectionRef.current = controller;
      lastMessageRef.current = Date.now();
      void run(controller);
    };

    const retryNow = (): void => {
      if (!mounted) return;
      loggedOut = false;
      clearTimer();
      connect();
    };
    retryRef.current = retryNow;

    // Back online: no point waiting out the backoff.
    const onOnline = (): void => {
      if (!openRef.current) retryNow();
    };

    const checkSilence = (): void => {
      if (!openRef.current) return;
      if (Date.now() - lastMessageRef.current > HEARTBEAT_TIMEOUT_MS) scheduleReconnect();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") checkSilence();
    };
    const watchdog = window.setInterval(checkSilence, 1000);

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    connect();

    return () => {
      mounted = false;
      retryRef.current = () => {};
      window.clearInterval(watchdog);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      setStatus("disconnected");
      clearTimer();
      closeConnection();
    };
  }, [query]);

  const retry = useCallback(() => retryRef.current(), []);

  return { prices, feed, status, reconnectAttempts, nextRetryAt, retry };
}
