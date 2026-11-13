// One-off cleanup for idempotency markers written before they had a TTL.
//
//   pnpm --filter @stock-platform/consumer cleanup:markers            # delete
//   pnpm --filter @stock-platform/consumer cleanup:markers --dry-run  # count only
//
// Walks `consumer:processed:*` with SCAN (never KEYS, which blocks Redis for the
// whole keyspace) and removes keys with UNLINK (memory is reclaimed off the main
// thread). Only markers WITHOUT an expiry are removed: those written by the
// current consumer carry a 24-hour TTL, still guard against Kafka redelivery,
// and expire on their own.
//
// Safe to stop at any point and run again: it keeps no state, and a second run
// only finds whatever the first one did not reach.
//
// Redis URL: REDIS_URL from the environment, else from the repo's .env.local.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";

const PATTERN = "consumer:processed:*";
const SCAN_COUNT = 1000;
const NO_EXPIRY = -1;

function redisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env.local");
  try {
    const match = readFileSync(envFile, "utf8").match(/^\s*REDIS_URL=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env.local; fall through
  }
  throw new Error("REDIS_URL is not set and was not found in .env.local");
}

const dryRun = process.argv.includes("--dry-run");
const redis = new Redis(redisUrl(), { maxRetriesPerRequest: 3 });

let scanned = 0;
let removed = 0;
let kept = 0;

try {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", PATTERN, "COUNT", SCAN_COUNT);
    cursor = next;
    if (keys.length === 0) continue;
    scanned += keys.length;

    const ttlPipeline = redis.pipeline();
    for (const key of keys) ttlPipeline.ttl(key);
    const ttls = await ttlPipeline.exec();

    const permanent = keys.filter((_, i) => ttls?.[i]?.[1] === NO_EXPIRY);
    kept += keys.length - permanent.length;

    if (permanent.length > 0) {
      // SCAN may return a key more than once; UNLINK reports how many really went.
      removed += dryRun ? permanent.length : await redis.unlink(...permanent);
    }
    if (scanned % (SCAN_COUNT * 50) < keys.length) {
      console.log(`... scanned ${scanned}, ${dryRun ? "would remove" : "removed"} ${removed}`);
    }
  } while (cursor !== "0");

  console.log(
    `${dryRun ? "Dry run: would remove" : "Removed"} ${removed} marker(s) without expiry; ` +
      `left ${kept} with a TTL (scanned ${scanned}).`,
  );
} finally {
  redis.disconnect();
}
