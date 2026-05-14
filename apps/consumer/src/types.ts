import type { KafkaBrokerEnv } from "@stock-platform/kafka";

export type AppEnv = KafkaBrokerEnv & {
  KAFKA_GROUP_ID: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  PORT: number;
};

export type HealthStatus = {
  status: "starting" | "healthy";
  messagesProcessed: number;
  lastMessageAt: number | null;
};
