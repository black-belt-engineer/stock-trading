import type { PriceEvent } from "@stock-platform/types";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { ConsumedMessage } from "../models/consumed-message.js";
import { PriceRedisRepository } from "../repositories/price-redis.repository.js";
import { StockTickRepository } from "../repositories/stock-tick.repository.js";
import type { Logger } from "@stock-platform/logger";

export class MarketDataService {
  private readonly stockTickRepository: StockTickRepository;
  private readonly priceRedisRepository: PriceRedisRepository;

  constructor(
    private readonly db: Pool,
    redis: Redis,
    log: Logger,
  ) {
    this.stockTickRepository = new StockTickRepository(db, log);
    this.priceRedisRepository = new PriceRedisRepository(redis);
  }

  async initialize(): Promise<void> {
    await this.stockTickRepository.prepareSchema();
  }

  /**
   * 1. Postgres tick (idempotent on message key)
   * 2. Redis snapshot + stream entry (idempotent on message key)
   *
   * Throws on failure so the caller skips the Kafka offset commit.
   */
  async persistPriceEvent(event: PriceEvent, message: ConsumedMessage): Promise<void> {
    await this.persistTick(event, message.idempotencyKey);
    await this.priceRedisRepository.publishFromEvent(event, message.idempotencyKey);
  }

  private async persistTick(event: PriceEvent, idempotencyKey: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await this.stockTickRepository.insertTick(client, event, idempotencyKey);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
