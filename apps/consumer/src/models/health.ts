export type ConsumerHealthStatus = {
  status: "starting" | "healthy";
  messagesProcessed: number;
  lastMessageAt: number | null;
};
