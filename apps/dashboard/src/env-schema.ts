import { kafkaEnvSchemaProperties } from "@stock-platform/kafka";

export const dashboardEnvSchema = {
  type: "object",
  required: ["KAFKA_BROKERS"],
  properties: {
    ...kafkaEnvSchemaProperties("dashboard"),
    DASHBOARD_KAFKA_GROUP_ID: { type: "string", default: "stock-prices-dashboard" },
    DASHBOARD_PORT: { type: "number", default: 3200 },
  },
} as const;
