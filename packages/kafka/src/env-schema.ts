/** Type of the shared `KAFKA_*` settings validated by {@link kafkaEnvSchemaProperties}. */
export type KafkaBrokerEnv = {
  KAFKA_BROKERS: string;
  KAFKA_TOPIC: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_TOPIC_PARTITIONS: number;
  KAFKA_REPLICATION_FACTOR: number;
};

/**
 * JSON-schema `properties` fragment for `@fastify/env` (merge into each app’s full env schema).
 */
export function kafkaEnvSchemaProperties(defaultClientId: string) {
  return {
    KAFKA_BROKERS: { type: "string", minLength: 1 },
    KAFKA_TOPIC: { type: "string", default: "stock-prices" },
    KAFKA_CLIENT_ID: { type: "string", default: defaultClientId },
    KAFKA_TOPIC_PARTITIONS: { type: "number", default: 6 },
    KAFKA_REPLICATION_FACTOR: { type: "number", default: 1 },
  };
}
