import type { StreamQuote } from "@stock-platform/types";
import { LatestPriceRepository } from "../repositories/latest-price.repository.js";
import type { Redis } from "ioredis";
import { SSE_POLL_INTERVAL_MS } from "../constants.js";
import { parseSymbols, toStreamQuote } from "../models/stream.js";

export class StreamService {
  private readonly latestPriceRepository: LatestPriceRepository;

  constructor(redis: Redis) {
    this.latestPriceRepository = new LatestPriceRepository(redis);
  }

  async collectQuotes(symbolsQuery?: string): Promise<StreamQuote[]> {
    const symbols = parseSymbols(symbolsQuery);
    const quotes: StreamQuote[] = [];

    for (const symbol of symbols) {
      const latest = await this.latestPriceRepository.findBySymbol(symbol);
      if (latest) {
        quotes.push(toStreamQuote(latest));
      }
    }

    return quotes;
  }

  getPollIntervalMs(): number {
    return SSE_POLL_INTERVAL_MS;
  }
}
