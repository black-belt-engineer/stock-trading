import { Redis } from "ioredis";

export function createRedisClient(url: string): Redis {
  return new Redis(url);
}

export async function closeRedisClient(redis: Redis): Promise<void> {
  await redis.quit();
}

export async function pingRedis(redis: Redis): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
