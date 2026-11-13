import type { DayValues, TickDirection } from "../types";

/** Narrows parsed JSON (or history state) to an object whose fields can be checked one by one. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number, or null for anything else (missing, null, NaN, a string). */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A non-empty string, or null. */
export function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The day values of a quote or discovery entry; a missing or malformed field is null. */
export function parseDayValues(data: Record<string, unknown>): DayValues {
  return {
    sessionId: textOrNull(data.sessionId),
    previousClose: finiteOrNull(data.previousClose),
    open: finiteOrNull(data.open),
    high: finiteOrNull(data.high),
    low: finiteOrNull(data.low),
    volume: finiteOrNull(data.volume),
    change: finiteOrNull(data.change),
    changePercent: finiteOrNull(data.changePercent),
  };
}

export function parseTickDirection(value: unknown): TickDirection {
  return value === "up" || value === "down" ? value : "flat";
}
