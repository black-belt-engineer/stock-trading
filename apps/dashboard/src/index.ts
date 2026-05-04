import { PubSub } from "@google-cloud/pubsub";
import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import fastifyStatic from "@fastify/static";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@stock-platform/logger";
import type { PriceEvent } from "@stock-platform/types";

const log = createLogger("dashboard");

type AppEnv = {
  PUBSUB_PROJECT_ID: string;
  PUBSUB_TOPIC: string;
  PUBSUB_SUBSCRIPTION: string;
  PUBSUB_EMULATOR_HOST?: string;
  DASHBOARD_PORT: number;
};

type DashboardSnapshot = {
  status: "connecting" | "healthy";
  totalMessages: number;
  messagesPerSecond: number;
  lastMessageAt: number | null;
  bySymbol: Record<string, number>;
  latest: PriceEvent[];
};

function loadLocalEnv(): void {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(moduleDir, "../../.env.local"),
    resolve(moduleDir, "../../../.env.local"),
  ];

  for (const path of candidates) {
    const result = dotenv.config({ path, override: false });
    if (!result.error) {
      log.info({ path }, "Loaded environment file");
      return;
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: {
      type: "object",
      required: ["PUBSUB_PROJECT_ID", "PUBSUB_TOPIC", "PUBSUB_SUBSCRIPTION"],
      properties: {
        PUBSUB_PROJECT_ID: { type: "string", minLength: 1 },
        PUBSUB_TOPIC: { type: "string", minLength: 1 },
        PUBSUB_SUBSCRIPTION: { type: "string", minLength: 1 },
        PUBSUB_EMULATOR_HOST: { type: "string" },
        DASHBOARD_PORT: { type: "number", default: 3200 },
      },
    },
    dotenv: false,
  });

  const {
    PUBSUB_PROJECT_ID,
    PUBSUB_TOPIC,
    PUBSUB_SUBSCRIPTION,
    PUBSUB_EMULATOR_HOST,
    DASHBOARD_PORT,
  } = (fastify as typeof fastify & { config: AppEnv }).config;

  if (PUBSUB_EMULATOR_HOST) {
    log.info(
      { pubsubEmulatorHost: PUBSUB_EMULATOR_HOST },
      "Using Pub/Sub emulator",
    );
  }

  const pubsub = new PubSub({ projectId: PUBSUB_PROJECT_ID });
  const topic = pubsub.topic(PUBSUB_TOPIC);
  const [topicExists] = await topic.exists();
  if (!topicExists) {
    await topic.create();
    log.info({ topic: PUBSUB_TOPIC }, "Created Pub/Sub topic");
  }

  const subscription = topic.subscription(PUBSUB_SUBSCRIPTION);
  const [subExists] = await subscription.exists();
  if (!subExists) {
    await topic.createSubscription(PUBSUB_SUBSCRIPTION);
    log.info({ subscription: PUBSUB_SUBSCRIPTION }, "Created subscription");
  }

  await fastify.register(fastifyStatic, {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../public"),
    prefix: "/",
    index: "index.html",
  });

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

  subscription.on("error", (err) => {
    status = "connecting";
    log.error({ err }, "Subscription stream error");
  });

  subscription.on("message", (message) => {
    try {
      const event = JSON.parse(message.data.toString()) as PriceEvent;
      message.ack();

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
    } catch (err) {
      log.error({ err }, "Failed to parse incoming message");
      message.nack();
    }
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

  await fastify.listen({ port: DASHBOARD_PORT, host: "0.0.0.0" });
  log.info(
    { port: DASHBOARD_PORT },
    "Dashboard is live. Open http://localhost:3200",
  );
}

main().catch((err: unknown) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
