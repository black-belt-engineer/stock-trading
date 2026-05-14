import "./fastify-env.js";
import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import fastifyStatic from "@fastify/static";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv as loadLocalEnvFiles, registerShutdownHandlers } from "@stock-platform/env";
import { createLogger } from "@stock-platform/logger";
import type { PriceEvent } from "@stock-platform/types";
import { dashboardEnvSchema } from "./env-schema.js";
import { startPriceTickKafkaConsumer } from "./kafka-feed.js";
import type { AppEnv } from "./types.js";

const log = createLogger("dashboard");

type DashboardSnapshot = {
  status: "connecting" | "healthy";
  totalMessages: number;
  messagesPerSecond: number;
  lastMessageAt: number | null;
  bySymbol: Record<string, number>;
  latest: PriceEvent[];
};

async function main(): Promise<void> {
  loadLocalEnvFiles({ importMetaUrl: import.meta.url, log });
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: dashboardEnvSchema,
    dotenv: false,
  });

  const config: AppEnv = fastify.config;

  const latestLimit = 120;
  const clients = new Set<import("node:http").ServerResponse>();
  const latest: PriceEvent[] = [];
  const recentArrivalTimes: number[] = [];
  const bySymbol = new Map<string, number>();
  let totalMessages = 0;
  let messagesPerSecond = 0;
  let lastMessageAt: number | null = null;
  let status: "connecting" | "healthy" = "connecting";

  function refreshMessagesPerSecond(nowMs: number): void {
    recentArrivalTimes.push(nowMs);
    while (recentArrivalTimes.length > 0 && nowMs - recentArrivalTimes[0]! > 1000) {
      recentArrivalTimes.shift();
    }
    messagesPerSecond = recentArrivalTimes.length;
  }

  setInterval(() => {
    refreshMessagesPerSecond(Date.now());
  }, 1000);

  function snapshot(): DashboardSnapshot {
    return {
      status,
      totalMessages,
      messagesPerSecond,
      lastMessageAt,
      bySymbol: Object.fromEntries(bySymbol.entries()),
      latest: [...latest],
    };
  }

  function broadcastUpdate(): void {
    const payload = `event: update\ndata: ${JSON.stringify(snapshot())}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  }

  const kafkaFeed = await startPriceTickKafkaConsumer(
    {
      brokers: config.KAFKA_BROKERS,
      topic: config.KAFKA_TOPIC,
      groupId: config.DASHBOARD_KAFKA_GROUP_ID,
      clientId: config.KAFKA_CLIENT_ID,
      numPartitions: config.KAFKA_TOPIC_PARTITIONS,
      replicationFactor: config.KAFKA_REPLICATION_FACTOR,
    },
    log,
    (event) => {
      status = "healthy";
      totalMessages += 1;
      lastMessageAt = Date.now();
      refreshMessagesPerSecond(lastMessageAt);
      bySymbol.set(event.symbol, (bySymbol.get(event.symbol) ?? 0) + 1);
      latest.unshift(event);
      if (latest.length > latestLimit) {
        latest.length = latestLimit;
      }
      broadcastUpdate();
    },
  );

  await fastify.register(fastifyStatic, {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../public"),
    prefix: "/",
    index: "index.html",
  });

  fastify.get("/api/health", async () => ({
    status,
    totalMessages,
    messagesPerSecond,
    clients: clients.size,
    lastMessageAt,
  }));

  fastify.get("/api/snapshot", async () => snapshot());

  fastify.get("/api/events", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    clients.add(reply.raw);
    reply.raw.write(`event: update\ndata: ${JSON.stringify(snapshot())}\n\n`);

    request.raw.on("close", () => {
      clients.delete(reply.raw);
    });

    return reply;
  });

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    log.info({ signal }, "Shutting down dashboard");
    await kafkaFeed.disconnect();
    await fastify.close();
    process.exit(0);
  }

  registerShutdownHandlers({ onShutdown: shutdown });

  await fastify.listen({ port: config.DASHBOARD_PORT, host: "0.0.0.0" });
  log.info(
    { port: config.DASHBOARD_PORT },
    "Dashboard is live. Open http://localhost:3200",
  );
}

main().catch((err: unknown) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
