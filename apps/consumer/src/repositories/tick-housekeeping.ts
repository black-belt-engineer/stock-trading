import type { Pool } from "pg";
import type { Logger } from "@stock-platform/logger";

/**
 * Retention, compression and the 1-minute candle aggregate for `stock_ticks`
 * (roadmap S3 steps 2–4, M4 step 3; the reasons are in docs/adr/ADR-003).
 * Values are Postgres interval literals.
 */
export const TICK_HOUSEKEEPING = {
  /** Length of new chunks. Retention and compression act on whole chunks. */
  chunkInterval: "1 day",
  /** Raw ticks older than this are dropped. Candles keep them in `candles_1m`. */
  rawRetention: "30 days",
  /** Chunks older than this move to the columnstore. Must exceed any realistic tick lateness (Kafka keeps 12 h). */
  compressAfter: "2 days",
  /** The refresh policy rematerialises buckets in [now - start, now - end]. Must stay well inside `rawRetention`. */
  refreshStartOffset: "3 days",
  refreshEndOffset: "1 minute",
  refreshSchedule: "1 minute",
} as const;

/** The continuous aggregate the SSE service reads candles from. */
export const CANDLES_1M_VIEW = "candles_1m";

/**
 * One row per symbol and minute that has a priced tick. `last_trade` is the
 * newest tick time in the bucket: the candle response's `lastTradeAt`, which
 * stops the browser counting a streamed trade twice. Real-time aggregation is
 * on (`materialized_only = false`), so the open bucket and anything newer than
 * the last refresh are read from the raw ticks.
 */
const CREATE_CANDLES_1M = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS ${CANDLES_1M_VIEW}
  WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
  SELECT
    symbol,
    time_bucket(INTERVAL '1 minute', time) AS bucket,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(size) AS volume,
    max(time) AS last_trade
  FROM stock_ticks
  WHERE price IS NOT NULL
  GROUP BY symbol, bucket
  WITH DATA
`;

type PolicyCheck = {
  /** `proc_name` in `timescaledb_information.jobs`. */
  proc: string;
  /** The hypertable the job belongs to (the aggregate's own hypertable for a refresh policy, hence the view name). */
  owner: string;
  /** Config keys and the interval each must have. */
  expected: Record<string, string>;
};

/**
 * Every `add_*_policy` call uses `if_not_exists`, which keeps an existing
 * policy as it is. Warns when a policy in the database no longer matches
 * these values, so a changed constant is not silently ignored. Changing one
 * means removing the old policy by hand (see ADR-003).
 */
async function warnOnPolicyDrift(db: Pool, log: Logger, check: PolicyCheck): Promise<void> {
  const result = await db.query(
    `
    SELECT j.job_id, j.config
    FROM timescaledb_information.jobs j
    LEFT JOIN timescaledb_information.continuous_aggregates c
      ON c.materialization_hypertable_schema = j.hypertable_schema
     AND c.materialization_hypertable_name = j.hypertable_name
    WHERE j.proc_name = $1 AND (j.hypertable_name = $2 OR c.view_name = $2)
  `,
    [check.proc, check.owner],
  );
  for (const row of result.rows) {
    if (typeof row !== "object" || row === null) continue;
    const config: unknown = Reflect.get(row, "config");
    if (typeof config !== "object" || config === null) continue;
    for (const [key, interval] of Object.entries(check.expected)) {
      const actual: unknown = Reflect.get(config, key);
      if (typeof actual !== "string") continue;
      const same = await db.query("SELECT $1::interval = $2::interval AS same", [actual, interval]);
      const sameRow: unknown = same.rows[0];
      if (typeof sameRow === "object" && sameRow !== null && Reflect.get(sameRow, "same") === true) continue;
      log.warn(
        { jobId: Reflect.get(row, "job_id"), proc: check.proc, key, actual, expected: interval },
        "Timescale policy differs from the code; it is kept as it is until removed by hand (ADR-003)",
      );
    }
  }
}

/**
 * Configures `stock_ticks` for housekeeping. Call it only when the table is a
 * hypertable. The order is fixed: the aggregate materialises all existing
 * history before retention is enabled, because a dropped raw chunk cannot be
 * aggregated afterwards. If the aggregate cannot be created, retention is not
 * enabled either. Every step is idempotent, so a restart repeats them safely.
 */
export async function configureTickHousekeeping(db: Pool, log: Logger): Promise<void> {
  const h = TICK_HOUSEKEEPING;

  await db.query("SELECT set_chunk_time_interval('stock_ticks', $1::interval)", [h.chunkInterval]);

  try {
    await db.query(CREATE_CANDLES_1M);
    await db.query(
      `SELECT add_continuous_aggregate_policy($1::regclass,
         start_offset => $2::interval, end_offset => $3::interval,
         schedule_interval => $4::interval, if_not_exists => true)`,
      [CANDLES_1M_VIEW, h.refreshStartOffset, h.refreshEndOffset, h.refreshSchedule],
    );
  } catch (err) {
    log.warn({ err }, "Could not set up the candles_1m aggregate; retention stays off so no history is lost");
    return;
  }

  try {
    // idempotency_key is in the order-by so the unique index stays cheap to check on compressed chunks.
    await db.query(`
      ALTER TABLE stock_ticks SET (
        timescaledb.enable_columnstore = true,
        timescaledb.segmentby = 'symbol',
        timescaledb.orderby = 'time DESC, idempotency_key'
      )
    `);
    await db.query("CALL add_columnstore_policy('stock_ticks', after => $1::interval, if_not_exists => true)", [
      h.compressAfter,
    ]);
  } catch (err) {
    log.warn({ err }, "Could not enable compression for stock_ticks");
  }

  await db.query("SELECT add_retention_policy('stock_ticks', drop_after => $1::interval, if_not_exists => true)", [
    h.rawRetention,
  ]);

  await warnOnPolicyDrift(db, log, {
    proc: "policy_refresh_continuous_aggregate",
    owner: CANDLES_1M_VIEW,
    expected: { start_offset: h.refreshStartOffset, end_offset: h.refreshEndOffset },
  });
  await warnOnPolicyDrift(db, log, {
    proc: "policy_compression",
    owner: "stock_ticks",
    expected: { compress_after: h.compressAfter },
  });
  await warnOnPolicyDrift(db, log, {
    proc: "policy_retention",
    owner: "stock_ticks",
    expected: { drop_after: h.rawRetention },
  });

  log.info(
    { retention: h.rawRetention, compressAfter: h.compressAfter, aggregate: CANDLES_1M_VIEW },
    "stock_ticks housekeeping configured",
  );
}
