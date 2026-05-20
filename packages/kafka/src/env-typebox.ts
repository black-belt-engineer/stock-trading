import { Type, type Static } from "@sinclair/typebox";

export function kafkaBrokerEnvSchema(defaultClientId: string) {
  return Type.Object({
    KAFKA_BROKERS: Type.String({ minLength: 1 }),
    KAFKA_TOPIC: Type.String({ default: "stock-prices" }),
    KAFKA_CLIENT_ID: Type.String({ default: defaultClientId }),
    KAFKA_TOPIC_PARTITIONS: Type.Integer({ minimum: 1, default: 6 }),
    KAFKA_REPLICATION_FACTOR: Type.Integer({ minimum: 1, default: 1 }),
  });
}

export type KafkaBrokerEnv = Static<ReturnType<typeof kafkaBrokerEnvSchema>>;
