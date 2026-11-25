import { NotFoundError, ValidationError } from "@stock-platform/errors";
import { findSymbol, isValidSymbolFormat, type SymbolInfo } from "@stock-platform/symbols";

/** Upper-cases and trims a symbol from a request; 400 when it cannot be a ticker at all. */
export function normaliseSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase();
  if (!isValidSymbolFormat(symbol)) {
    throw new ValidationError(`Invalid symbol: ${JSON.stringify(raw)}`);
  }
  return symbol;
}

/**
 * Checks one symbol from a request against the registry (M1): 400 for a malformed symbol, 404 for
 * a well-formed one that is not listed. Same rules as the SSE service's `resolveSymbol`.
 */
export function resolveSymbol(raw: string): SymbolInfo {
  const symbol = normaliseSymbol(raw);
  const info = findSymbol(symbol);
  if (!info) {
    throw new NotFoundError(`Unknown symbol: ${symbol}`);
  }
  return info;
}

/** Whether a stored symbol is still in the registry. A removed one stays stored but is not quoted. */
export function isListed(symbol: string): boolean {
  return findSymbol(symbol) !== undefined;
}
