import type { AlertDirection } from "./alertsApi";

/**
 * Alert amounts are compared in whole cents (plan P2: "store NUMERIC, compare in cents"). The
 * server sends and takes decimal strings; a live price is a JS number with two decimals, which is
 * rounded to cents once, here.
 */

const AMOUNT = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;

/** `"228.5"` → 22850, by string arithmetic. `null` for anything the server would refuse. */
export function centsOf(amount: string): number | null {
  if (!AMOUNT.test(amount)) return null;
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** A live price (a float like 228.49999…) as whole cents. */
export function priceToCents(price: number): number {
  return Math.round(price * 100);
}

/** 22850 → `"228.50"`, the form the API takes. */
export function formatCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** 22850 → "$228.50", like `formatPrice`, without going through a float sum. */
export function formatCentsAsPrice(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

/** A stored amount ("228.50") for display ("$228.50"); the raw string if it cannot be read. */
export function formatAmount(amount: string): string {
  const cents = centsOf(amount);
  return cents === null ? amount : formatCentsAsPrice(cents);
}

/** `>=` and `<=`, never equality: a price can jump past a threshold between two ticks. */
export function conditionMet(direction: AlertDirection, thresholdCents: number, priceCents: number): boolean {
  return direction === "above" ? priceCents >= thresholdCents : priceCents <= thresholdCents;
}

export type ThresholdInput = { ok: true; cents: number } | { ok: false; message: string };

/**
 * What the user typed in the price field. Spaces, a leading "$" and thousands commas are allowed
 * ("$1,200.5"); the value must be positive with at most two decimals.
 */
export function parseThresholdInput(raw: string): ThresholdInput {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") return { ok: false, message: "Enter a price" };
  const cents = centsOf(cleaned);
  if (cents === null) return { ok: false, message: "Enter a price like 228.50, with at most two decimals" };
  if (cents <= 0) return { ok: false, message: "The price must be above zero" };
  return { ok: true, cents };
}
