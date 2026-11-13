import type { Logger } from "@stock-platform/logger";
import { SYMBOL_REGISTRY, type SymbolInfo } from "@stock-platform/symbols";
import { STAGGER_MS, TICK_INTERVAL_MS } from "../constants.js";
import type { IngestionHealth } from "../models/ingestion-state.js";
import { KafkaProducerService } from "./kafka-producer.service.js";
import { PriceEventService } from "./price-event.service.js";

export class IngestionService {
  private tickCount = 0;
  private shuttingDown = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly intervals: ReturnType<typeof setInterval>[] = [];
  private readonly startupTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly priceEventService: PriceEventService,
    private readonly log: Logger,
  ) {}

  getHealth(): IngestionHealth {
    return { tickCount: this.tickCount };
  }

  start(): void {
    for (let i = 0; i < SYMBOL_REGISTRY.length; i += 1) {
      const row = SYMBOL_REGISTRY[i]!;
      const delayMs = i * STAGGER_MS;

      const timeout = setTimeout(() => {
        void this.publishForSymbol(row);

        const interval = setInterval(() => {
          void this.publishForSymbol(row);
        }, TICK_INTERVAL_MS);
        this.intervals.push(interval);
      }, delayMs);

      this.startupTimeouts.push(timeout);
    }
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;

    for (const id of this.startupTimeouts) {
      clearTimeout(id);
    }
    for (const id of this.intervals) {
      clearInterval(id);
    }

    const toFlush = [...this.pending];
    await Promise.all(toFlush);
    this.log.info({ flushed: toFlush.length }, "Pending publishes settled");
  }

  private async publishForSymbol(row: SymbolInfo): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    const event = this.priceEventService.buildNextEvent(row);
    const publishPromise = this.kafkaProducer
      .publish(event)
      .then(() => {
        this.tickCount += 1;
        this.log.debug({ symbol: row.symbol }, "Published tick");
      })
      .catch((err: unknown) => {
        this.log.error({ err, symbol: row.symbol }, "Failed to publish tick");
      });

    this.pending.add(publishPromise);
    void publishPromise.finally(() => {
      this.pending.delete(publishPromise);
    });
  }
}
