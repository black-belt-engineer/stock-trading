import { DEFAULT_SYMBOLS } from "../constants.js";

export function parseSymbols(rawSymbols?: string): string[] {
  if (!rawSymbols) {
    return [...DEFAULT_SYMBOLS];
  }
  const parsed = rawSymbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_SYMBOLS];
}
