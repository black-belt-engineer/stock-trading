import type { PriceEvent } from "@stock-platform/types";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { LatestPriceRepository } from "../repositories/latest-price.repository.js";
import { StockTickRepository } from "../repositories/stock-tick.repository.js";
import type { Logger } from "@stock-platform/logger";

export class MarketDataService {
  private readonly stockTickRepository: StockTickRepository;
  private readonly latestPriceRepository: LatestPriceRepository;

  constructor(db: Pool, redis: Redis, log: Logger) {
    this.stockTickRepository = new StockTickRepository(db, log);
    this.latestPriceRepository = new LatestPriceRepository(redis);
  }

  async initialize(): Promise<void> {
    await this.stockTickRepository.prepareSchema();
  }

  async persistPriceEvent(event: PriceEvent): Promise<void> {
    await Promise.all([
      this.stockTickRepository.insertTick(event),
      this.latestPriceRepository.upsertFromEvent(event),
    ]);
  }
}
