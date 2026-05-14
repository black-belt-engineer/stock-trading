export type AppEnv = {
  KAFKA_BROKERS: string;
  KAFKA_TOPIC: string;
  KAFKA_GROUP_ID: string;
  KAFKA_CLIENT_ID: string;
  KAFKA_TOPIC_PARTITIONS: number;
  KAFKA_REPLICATION_FACTOR: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  PORT: number;
};

export type HealthStatus = {
  status: "starting" | "healthy";
  messagesProcessed: number;
  lastMessageAt: number | null;
};
