import { sessionIdFor, sessionStartFor } from "@stock-platform/symbols";
import type { PriceEvent } from "@stock-platform/types";
import type { ConsumedMessage } from "../models/consumed-message.js";
import type { ApplyTickResult, PriceRedisRepository } from "../repositories/price-redis.repository.js";
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
   * 1. Postgres tick (idempotent on message key). Every tick is stored, also
   *    one that arrives after a newer one.
   * 2. Redis day values, sparkline and stream entry, in one atomic step
   *    (idempotent on message key). The session comes from the event time.
   *
   * Throws on failure so the caller skips the Kafka offset commit.
   */
  async persistPriceEvent(event: PriceEvent, message: ConsumedMessage): Promise<ApplyTickResult> {
    await this.stockTickRepository.insertTick(event, message.idempotencyKey);

    const sessionId = sessionIdFor(event.timestamp, event.exchange);
    return this.priceRedisRepository.applyTick({ event, sessionId }, message.idempotencyKey, () =>
      this.stockTickRepository.findSessionBaseline(
        event.symbol,
        sessionStartFor(event.timestamp, event.exchange),
        event.timestamp,
      ),
    );
  }
}
