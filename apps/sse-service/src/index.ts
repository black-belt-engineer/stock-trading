import Fastify from "fastify";
import fastifyEnv from "@fastify/env";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "@stock-platform/logger";
import type { LatestPrice, StreamQuote } from "@stock-platform/types";

const log = createLogger("sse-service");
const ALL_SYMBOLS = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN", "NVDA"] as const;

type AppEnv = {
  REDIS_URL: string;
  PORT: number;
};

type ActiveStock = {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  changeValue: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
  sparkline: number[];
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

function parseSymbols(rawSymbols?: string): string[] {
  if (!rawSymbols) {
    return [...ALL_SYMBOLS];
  }
  const parsed = rawSymbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...ALL_SYMBOLS];
}

async function readLatestPrice(
  redis: Redis,
  symbol: string,
): Promise<LatestPrice | null> {
  const raw = await redis.get(`price:latest:${symbol}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as LatestPrice;
}

async function readSparkline(redis: Redis, symbol: string): Promise<number[]> {
  const values = await redis.zrange(`price:sparkline:${symbol}`, 0, -1);
  return values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
}

function toStreamQuote(latest: LatestPrice): StreamQuote {
  return {
    symbol: latest.symbol,
    name: latest.name,
    price: latest.currentPrice,
    changePercent: latest.changePercent,
    quantity: 0,
    side: latest.changeValue >= 0 ? "buy" : "sell",
    timestamp: latest.lastUpdated,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const fastify = Fastify({ logger: false });

  await fastify.register(fastifyEnv, {
    confKey: "config",
    schema: {
      type: "object",
      required: ["REDIS_URL"],
      properties: {
        REDIS_URL: { type: "string", minLength: 1 },
        PORT: { type: "number", default: 3003 },
      },
    },
    dotenv: false,
  });

  const { REDIS_URL, PORT } = (fastify as typeof fastify & { config: AppEnv }).config;
  const redis = new Redis(REDIS_URL);
  let activeConnections = 0;

  fastify.get("/health", async () => ({
    status: "ok" as const,
    activeConnections,
  }));

  fastify.get<{ Params: { symbol: string } }>(
    "/quotes/:symbol/snapshot",
    async (request, reply) => {
      const symbol = request.params.symbol.toUpperCase();
      const latest = await readLatestPrice(redis, symbol);
      if (!latest) {
        return reply.code(404).send({ error: `No quote found for ${symbol}` });
      }
      return latest;
    },
  );

  fastify.get("/quotes/discovery/active-stocks", async (): Promise<{ listName: string; stocks: ActiveStock[] }> => {
    const stocks = await Promise.all(
      ALL_SYMBOLS.map(async (symbol) => {
        const [latest, sparkline] = await Promise.all([
          readLatestPrice(redis, symbol),
          readSparkline(redis, symbol),
        ]);
        return {
          symbol,
          name: latest?.name ?? symbol,
          currentPrice: latest?.currentPrice ?? 0,
          changePercent: latest?.changePercent ?? 0,
          changeValue: latest?.changeValue ?? 0,
          high24h: latest?.high24h ?? 0,
          low24h: latest?.low24h ?? 0,
          volume24h: latest?.volume24h ?? 0,
          lastUpdated: latest?.lastUpdated ?? 0,
          sparkline,
        };
      }),
    );
    return {
      listName: "active-stocks",
      stocks,
    };
  });

  fastify.get<{ Querystring: { symbols?: string } }>(
    "/stream",
    async (request, reply) => {
      const symbols = parseSymbols(request.query.symbols);

      request.raw.setTimeout(0);
      reply.raw.setTimeout(0);
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders?.();

      activeConnections += 1;

      const sendPrices = async (): Promise<void> => {
        for (const symbol of symbols) {
          const latest = await readLatestPrice(redis, symbol);
          if (!latest) {
            continue;
          }
          const payload: StreamQuote = toStreamQuote(latest);
          reply.raw.write(`event: price\ndata: ${JSON.stringify(payload)}\n\n`);
        }
      };

      await sendPrices();
      const timer = setInterval(() => {
        void sendPrices().catch((err: unknown) => {
          log.error({ err }, "Failed to stream SSE update");
        });
      }, 500);

      request.raw.on("close", () => {
        clearInterval(timer);
        activeConnections = Math.max(0, activeConnections - 1);
      });

      return reply;
    },
  );

  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  log.info({ port: PORT }, "SSE service listening");

  async function shutdown(signal: string): Promise<void> {
    log.info({ signal }, "Shutting down SSE service");
    await fastify.close();
    await redis.quit();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((err: unknown) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
