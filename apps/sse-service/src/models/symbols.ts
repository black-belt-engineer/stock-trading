import { NotFoundError, ValidationError } from "@stock-platform/errors";
import { findSymbol, isValidSymbolFormat, SYMBOL_REGISTRY, type SymbolInfo } from "@stock-platform/symbols";

/**
 * Checks one symbol from a request against the registry. Lower case is
 * accepted and upper-cased. Throws 400 for a malformed symbol and 404 for a
 * well-formed one that is not listed.
 */
export function resolveSymbol(raw: string): SymbolInfo {
  const symbol = raw.trim().toUpperCase();
  if (!isValidSymbolFormat(symbol)) {
    throw new ValidationError(`Invalid symbol: ${JSON.stringify(raw)}`);
  }
  const info = findSymbol(symbol);
  if (!info) {
    throw new NotFoundError(`Unknown symbol: ${symbol}`);
  }
  return info;
}

/**
 * Parses the `symbols` query of `/stream`: a comma-separated list. Missing or
 * empty means every registered symbol. One bad entry rejects the whole list
 * (see {@link resolveSymbol}). Duplicates are dropped.
 */
export function parseSymbolList(rawSymbols?: string): string[] {
  const parts = (rawSymbols ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return SYMBOL_REGISTRY.map((row) => row.symbol);
  }
  return [...new Set(parts.map((part) => resolveSymbol(part).symbol))];
}
