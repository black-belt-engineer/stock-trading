export type AppEnv = {
  KAFKA_BROKERS: string;
  KAFKA_TOPIC: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_TOPIC_PARTITIONS: number;
  KAFKA_REPLICATION_FACTOR: number;
  PORT: number;
};
