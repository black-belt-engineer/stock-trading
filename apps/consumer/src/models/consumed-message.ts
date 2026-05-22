export type ConsumedMessage = {
  /** Copied from the Kafka record key set by the ingestor. */
  idempotencyKey: string;
};
