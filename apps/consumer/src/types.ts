export type AppEnv = {
  PUBSUB_PROJECT_ID: string;
  PUBSUB_TOPIC?: string;
  PUBSUB_SUBSCRIPTION: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  PUBSUB_EMULATOR_HOST?: string;
  PORT: number;
};

export type HealthStatus = {
  status: "starting" | "healthy";
  messagesProcessed: number;
  lastMessageAt: number | null;
};
