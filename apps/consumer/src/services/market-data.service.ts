import type { PriceEvent } from "@stock-platform/types";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { ConsumedMessage } from "../models/consumed-message.js";
import { LatestPriceRepository } from "../repositories/latest-price.repository.js";
import { StockTickRepository } from "../repositories/stock-tick.repository.js";
import type { Logger } from "@stock-platform/logger";

export class MarketDataService {
  private readonly stockTickRepository: StockTickRepository;
  private readonly latestPriceRepository: LatestPriceRepository;

  constructor(
    private readonly db: Pool,
    redis: Redis,
    log: Logger,
  ) {
    this.stockTickRepository = new StockTickRepository(db, log);
    this.latestPriceRepository = new LatestPriceRepository(redis);
  }

  async initialize(): Promise<void> {
    await this.stockTickRepository.prepareSchema();
  }

  /**
   * Postgres tick row (unique on message key) then Redis snapshot.
   * Throws on failure so the caller can skip offset commit and Kafka will redeliver.
   */
  async persistPriceEvent(event: PriceEvent, message: ConsumedMessage): Promise<void> {
    const { idempotencyKey } = message;

    await this.commitPostgres(event, idempotencyKey);
    await this.latestPriceRepository.upsertFromEvent(event, idempotencyKey);
  }

  private async commitPostgres(event: PriceEvent, idempotencyKey: string): Promise<void> {
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
