/**
 * Settings for the price topic (`KAFKA_TOPIC`, default `stock-prices`), used
 * by whichever service creates it first. Retention must stay well under the
 * consumer's 24-hour idempotency marker: a message replayed after its marker
 * expired would be applied to Redis twice (ADR-003). Retention only deletes
 * closed segments, so segments roll every hour; otherwise the broker default
 * (14 days in Redpanda) would keep everything regardless of `retention.ms`.
 *
 * An existing topic is not changed by `ensureTopic`; `scripts/dev.sh` applies
 * these values to it with `rpk topic alter-config`.
 */
export const PRICE_TOPIC_CONFIG_ENTRIES: ReadonlyArray<{ name: string; value: string }> = [
  { name: "retention.ms", value: String(12 * 60 * 60 * 1000) },
  { name: "segment.ms", value: String(60 * 60 * 1000) },
];
