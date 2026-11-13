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
          sessionId: latest?.sessionId ?? null,
          currentPrice: latest?.currentPrice ?? null,
          previousClose: latest?.previousClose ?? null,
          open: latest?.open ?? null,
          high: latest?.high ?? null,
          low: latest?.low ?? null,
          volume: latest?.volume ?? null,
          change: latest?.change ?? null,
          changePercent: latest?.changePercent ?? null,
          tickDirection: latest?.tickDirection ?? null,
          lastUpdated: latest?.lastUpdated ?? null,
          sparkline,
        };
      }),
    );
    return { listName: "active-stocks", stocks };
  }
}
