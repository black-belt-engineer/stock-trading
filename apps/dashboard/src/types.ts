import type { KafkaBrokerEnv } from "@stock-platform/kafka";

export type AppEnv = KafkaBrokerEnv & {
  DASHBOARD_KAFKA_GROUP_ID: string;
  DASHBOARD_PORT: number;
};
