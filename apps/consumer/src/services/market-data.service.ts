import type { PriceEvent } from "@stock-platform/types";
import type { ConsumedMessage } from "../models/consumed-message.js";
import type { PriceRedisRepository } from "../repositories/price-redis.repository.js";
import type { StockTickRepository } from "../repositories/stock-tick.repository.js";

export class MarketDataService {
  constructor(
    private readonly stockTickRepository: StockTickRepository,
    private readonly priceRedisRepository: PriceRedisRepository,
  ) {}

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
    await this.stockTickRepository.insertTick(event, message.idempotencyKey);
    await this.priceRedisRepository.publishFromEvent(event, message.idempotencyKey);
  }
}
