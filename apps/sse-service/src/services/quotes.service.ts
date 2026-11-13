import { NotFoundError } from "@stock-platform/errors";
import { SYMBOL_REGISTRY } from "@stock-platform/symbols";
import type { LatestPrice } from "@stock-platform/types";
import type { ActiveStock } from "../models/active-stock.js";
import type { LatestPriceRepository } from "../repositories/latest-price.repository.js";

export class QuotesService {
  constructor(private readonly latestPriceRepository: LatestPriceRepository) {}

  /** `symbol` must already be a registered symbol (see `resolveSymbol`). */
  async getSnapshot(symbol: string): Promise<LatestPrice> {
    const latest = await this.latestPriceRepository.findBySymbol(symbol);
    if (!latest) {
      throw new NotFoundError(`No quote found for ${symbol}`);
    }
    return latest;
  }

  async getActiveStocks(): Promise<{ listName: string; stocks: ActiveStock[] }> {
    const stocks = await Promise.all(
      SYMBOL_REGISTRY.map(async ({ symbol, name, sector, exchange }): Promise<ActiveStock> => {
        const [latest, sparkline] = await Promise.all([
          this.latestPriceRepository.findBySymbol(symbol),
          this.latestPriceRepository.findSparkline(symbol),
        ]);
        return {
          symbol,
          // The registry is the source of truth for names; a stored tick may predate a rename.
          name,
          sector,
          exchange,
          currentPrice: latest?.currentPrice ?? null,
          changePercent: latest?.changePercent ?? null,
          changeValue: latest?.changeValue ?? null,
          high24h: latest?.high24h ?? null,
          low24h: latest?.low24h ?? null,
          volume24h: latest?.volume24h ?? null,
          lastUpdated: latest?.lastUpdated ?? null,
          sparkline,
        };
      }),
    );
    return { listName: "active-stocks", stocks };
  }
}
