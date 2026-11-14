import { Type, type Static } from "@sinclair/typebox";
import { ValidationError } from "@stock-platform/errors";
import { sessionEndFor, sessionStartFor } from "@stock-platform/symbols";
import { CandleIntervalSchema, OhlcvBarSchema, type CandleInterval } from "@stock-platform/types";

/** Bars in the window when the request gives no `from`: the latest 120. */
export const DEFAULT_BAR_COUNT = 120;
/** Most bars one request may return. */
export const MAX_BAR_COUNT = 500;

/** Width of the fixed intervals; `1d` follows the market calendar instead. */
const FIXED_WIDTH_MS: Record<Exclude<CandleInterval, "1d">, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
};

export const candlesQuerySchema = Type.Object(
  {
    interval: CandleIntervalSchema,
    from: Type.Optional(Type.String({ format: "date-time" })),
    to: Type.Optional(Type.String({ format: "date-time" })),
    /** `previous` (default): an empty bucket is a flat bar at the previous close. `gaps`: it is left out. */
    fill: Type.Union([Type.Literal("previous"), Type.Literal("gaps")], { default: "previous" }),
  },
  { additionalProperties: false },
);

export const candlesResponseSchema = Type.Object({
  symbol: Type.String(),
  interval: CandleIntervalSchema,
  fill: Type.Union([Type.Literal("previous"), Type.Literal("gaps")]),
  /** Start of the first bucket in the window (the requested `from` rounded down to a bucket edge). */
  from: Type.String(),
  /** End (exclusive) of the last bucket in the window. */
  to: Type.String(),
  /** Oldest first. The last bar has `complete: false` while its bucket is open. */
  bars: Type.Array(OhlcvBarSchema),
  /**
   * ISO time of the newest trade the bars include, or `null` when there is none.
   * A client that adds streamed trades to the last bar applies only newer ones,
   * so no trade is counted twice.
   */
  lastTradeAt: Type.Union([Type.String(), Type.Null()]),
});

export type CandlesQuery = Static<typeof candlesQuerySchema>;
export type CandlesResponse = Static<typeof candlesResponseSchema>;
export type CandleFill = CandlesQuery["fill"];

/**
 * How to group ticks into buckets in SQL: a fixed width for `time_bucket`, or
 * the explicit bucket starts of a calendar interval (sessions vary in length).
 */
export type Bucketing = { kind: "fixed"; widthMs: number } | { kind: "calendar" };

/** The buckets a candle request covers. */
export type CandleWindow = {
  bucketing: Bucketing;
  /** Bucket starts, oldest first, epoch ms. */
  starts: number[];
  /** Bucket ends (exclusive), aligned with `starts`. */
  ends: number[];
  /** `starts[0]`. */
  from: number;
  /** The last bucket's end. */
  to: number;
};

/**
 * Bucket edges for `interval`. Every edge is UTC. A `1d` bucket is one session
 * of the symbol's exchange, so daily bars and the day stats (M2) share their
 * boundary; a real exchange calendar later moves both together.
 */
function bucketFns(interval: CandleInterval, exchange: string): {
  bucketing: Bucketing;
  startOf: (t: number) => number;
  endOf: (start: number) => number;
} {
  if (interval === "1d") {
    return {
      bucketing: { kind: "calendar" },
      startOf: (t) => sessionStartFor(t, exchange),
      endOf: (start) => sessionEndFor(start, exchange),
    };
  }
  const width = FIXED_WIDTH_MS[interval];
  return {
    bucketing: { kind: "fixed", widthMs: width },
    // Aligned to the Unix epoch, which is what `time_bucket` with origin 'epoch' does.
    startOf: (t) => Math.floor(t / width) * width,
    endOf: (start) => start + width,
  };
}

/**
 * The buckets between `from` and `to`, both widened to whole buckets.
 * A missing `to` is now and a future one is clamped to now; a missing `from`
 * gives the latest 120 buckets. Throws 400 when `from` is not before `to` or
 * the window would hold more than 500 bars.
 */
export function resolveCandleWindow(
  interval: CandleInterval,
  exchange: string,
  rawFrom: string | undefined,
  rawTo: string | undefined,
  now: number,
): CandleWindow {
  const { bucketing, startOf, endOf } = bucketFns(interval, exchange);
  const requestedTo = rawTo === undefined ? now : Date.parse(rawTo);
  const to = Math.min(requestedTo, now);
  const requestedFrom = rawFrom === undefined ? undefined : Date.parse(rawFrom);
  if (!Number.isFinite(to) || (requestedFrom !== undefined && !Number.isFinite(requestedFrom))) {
    throw new ValidationError("from and to must be ISO-8601 date-times");
  }
  if (requestedFrom !== undefined && requestedFrom >= to) {
    throw new ValidationError("from must be before to (to is clamped to the current time)");
  }

  // `to` is exclusive: a `to` exactly on an edge ends with the bucket before it.
  // With the default `to` (now) the last bucket is the open one.
  const lastStart = startOf(rawTo === undefined ? to : to - 1);
  const starts: number[] = [lastStart];
  const tooMany = (): ValidationError =>
    new ValidationError(
      `The range holds more than ${MAX_BAR_COUNT} ${interval} bars. Choose a larger interval or a shorter range.`,
    );

  if (requestedFrom === undefined) {
    while (starts.length < DEFAULT_BAR_COUNT) {
      const earliest = starts[0] ?? lastStart;
      starts.unshift(startOf(earliest - 1));
    }
  } else {
    const firstStart = startOf(requestedFrom);
    if (bucketing.kind === "fixed" && (lastStart - firstStart) / bucketing.widthMs + 1 > MAX_BAR_COUNT) {
      throw tooMany();
    }
    for (let earliest = lastStart; earliest > firstStart; ) {
      earliest = startOf(earliest - 1);
      starts.unshift(earliest);
      if (starts.length > MAX_BAR_COUNT) throw tooMany();
    }
  }

  const ends = starts.map(endOf);
  return {
    bucketing,
    starts,
    ends,
    from: starts[0] ?? lastStart,
    to: ends.at(-1) ?? endOf(lastStart),
  };
}
