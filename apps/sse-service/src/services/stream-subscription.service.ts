import type { Redis } from "ioredis";
import {
  LatestPriceSchema,
  parseJson,
  PRICE_UPDATES_STREAM_KEY,
  streamQuoteFromLatest,
  type StreamQuote,
} from "@stock-platform/types";
import type { LatestPriceRepository } from "../repositories/latest-price.repository.js";

const BLOCK_MS = 5000;

function quoteFromStreamFields(fieldList: string[]): StreamQuote | null {
  const fields: Record<string, string> = {};
  for (let i = 0; i < fieldList.length; i += 2) {
    const key = fieldList[i];
    const value = fieldList[i + 1];
    if (key !== undefined && value !== undefined) {
      fields[key] = value;
    }
  }
  if (!fields.payload) {
    return null;
  }
  // Malformed entries, and entries in the format before session values, are
  // skipped instead of breaking the read loop.
  const latest = parseJson(LatestPriceSchema, fields.payload);
  return latest ? streamQuoteFromLatest(latest) : null;
}

export class StreamSubscriptionService {
  constructor(
    private readonly redis: Redis,
    private readonly latestPriceRepository: LatestPriceRepository,
  ) {}

  /** `symbols` must already be validated (see `parseSymbolList`). */
  async getInitialQuotes(symbols: readonly string[]): Promise<StreamQuote[]> {
    const quotes: StreamQuote[] = [];

    for (const symbol of symbols) {
      const latest = await this.latestPriceRepository.findBySymbol(symbol);
      if (latest) {
        quotes.push(streamQuoteFromLatest(latest));
      }
    }
    return quotes;
  }

  subscribe(
    symbolList: readonly string[],
    onQuote: (quote: StreamQuote) => void,
    onError?: (err: Error) => void,
  ): () => void {
    const symbols = new Set(symbolList);
    const reader = this.redis.duplicate();
    let active = true;
    let lastId = "$";

    const readLoop = async (): Promise<void> => {
      while (active) {
        try {
          const response = await reader.xread(
            "BLOCK",
            BLOCK_MS,
            "STREAMS",
            PRICE_UPDATES_STREAM_KEY,
            lastId,
          );

          if (!response || response.length === 0) {
            continue;
          }

          for (const [, messages] of response) {
            for (const [id, fieldList] of messages) {
              lastId = id;
              const quote = quoteFromStreamFields(fieldList);
              if (quote && symbols.has(quote.symbol)) {
                onQuote(quote);
              }
            }
          }
        } catch (err: unknown) {
          if (!active) {
            break;
          }
          this.handleReadError(err, onError);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    void readLoop().finally(() => {
      void reader.quit();
    });

    return () => {
      active = false;
    };
  }

  private handleReadError(err: unknown, onError?: (err: Error) => void): void {
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
  }
}
