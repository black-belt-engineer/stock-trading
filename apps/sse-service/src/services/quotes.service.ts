import { NotFoundError } from "@stock-platform/errors";
import type { LatestPrice } from "@stock-platform/types";
import { DEFAULT_SYMBOLS } from "../constants.js";
import type { ActiveStock } from "../models/active-stock.js";
import type { LatestPriceRepository } from "../repositories/latest-price.repository.js";

export class QuotesService {
  constructor(private readonly latestPriceRepository: LatestPriceRepository) {}

  async getSnapshot(symbol: string): Promise<LatestPrice> {
    const latest = await this.latestPriceRepository.findBySymbol(symbol);
    if (!latest) {
      throw new NotFoundError(`No quote found for ${symbol}`);
    }
    return latest;
  }

  async getActiveStocks(): Promise<{ listName: string; stocks: ActiveStock[] }> {
    const stocks = await Promise.all(
      DEFAULT_SYMBOLS.map(async (symbol) => {
        const [latest, sparkline] = await Promise.all([
          this.latestPriceRepository.findBySymbol(symbol),
          this.latestPriceRepository.findSparkline(symbol),
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
    return { listName: "active-stocks", stocks };
  }
}
