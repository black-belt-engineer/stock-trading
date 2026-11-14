import { Type, type Static } from "@sinclair/typebox";

/** Default page size of `GET /quotes/:symbol/ticks`. */
export const DEFAULT_PAGE_LIMIT = 500;
/** Largest page a client may ask for. */
export const MAX_PAGE_LIMIT = 1000;

export const ticksParamsSchema = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
});

/** `from` and `to` are optional: see `resolveTimeRange` for the defaults. */
const rangeProperties = {
  from: Type.Optional(Type.String({ format: "date-time" })),
  to: Type.Optional(Type.String({ format: "date-time" })),
};

export const ticksQuerySchema = Type.Object(
  {
    ...rangeProperties,
    limit: Type.Integer({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT }),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { additionalProperties: false },
);

export const ticksCsvQuerySchema = Type.Object(rangeProperties, { additionalProperties: false });

/** One stored trade. A column is `null` only in rows older than the current schema. */
export const tickSchema = Type.Object({
  /** Unique per row; stable across pages. */
  id: Type.String(),
  /** ISO-8601 UTC, millisecond precision. */
  time: Type.String(),
  price: Type.Union([Type.Number(), Type.Null()]),
  size: Type.Union([Type.Number(), Type.Null()]),
  side: Type.Union([Type.Literal("buy"), Type.Literal("sell"), Type.Null()]),
});

export const ticksPageSchema = Type.Object({
  symbol: Type.String(),
  /** The range actually queried (defaults applied, `to` clamped to now). Page on with the same values. */
  from: Type.String(),
  to: Type.String(),
  /** Newest first. */
  ticks: Type.Array(tickSchema),
  /** Pass as `cursor` for the next (older) page; `null` on the last page. */
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});

export type Tick = Static<typeof tickSchema>;
export type TicksPage = Static<typeof ticksPageSchema>;

/**
 * Where the previous page ended: the last row's time, exact to the microsecond
 * as Postgres stores it, and its idempotency key to order rows of equal time.
 */
export type TickCursor = { time: string; key: string };

/** A tick as read from Postgres, with the exact time the cursor needs. */
export type TickRow = Tick & { cursor: TickCursor };
