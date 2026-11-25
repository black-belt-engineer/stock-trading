/**
 * Paper-trading amounts in the browser (P3): exact decimals as `bigint` in units of 10^-scale,
 * mirroring `apps/portfolio/src/models/money.ts`. The server sends decimal strings (cash with two
 * decimals, prices and average cost with four); a live price is a float with two decimals, which
 * is rounded to cents once, here. The alerts' number-based helpers (`alerts/money.ts`) stay as
 * they are: they never multiply by a share count.
 */

export const CASH_SCALE = 2;
export const PRICE_SCALE = 4;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** `"228.5"` at scale 4 → `2285000n`; `null` for anything else or for more decimals than `scale`. */
export function parseDecimal(text: string, scale: number): bigint | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign = "", whole = "0", fraction = ""] = match;
  if (fraction.length > scale && /[^0]/.test(fraction.slice(scale))) return null;
  const digits = fraction.slice(0, scale).padEnd(scale, "0");
  const value = BigInt(whole) * pow10(scale) + BigInt(digits === "" ? "0" : digits);
  return sign === "-" ? -value : value;
}

/** `numerator / denominator` rounded half away from zero; `denominator` must be positive. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

/** Changes the scale; going down rounds half away from zero. */
export function rescale(value: bigint, from: number, to: number): bigint {
  if (to >= from) return value * pow10(to - from);
  return divideRounded(value, pow10(from - to));
}

/** A live price (228.50999…) as whole cents, or `null` when there is none. */
export function centsFromPrice(price: number | null): bigint | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  return BigInt(Math.round(price * 100));
}

/** `123456n` cents → "$1,234.56"; negative → "−$1,234.56". */
export function formatMoney(cents: bigint): string {
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  const whole = (magnitude / 100n).toLocaleString("en-US");
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}$${whole}.${fraction}`;
}

/** P&L with a sign: "+$12.30", "−$4.00", "$0.00". */
export function formatSignedMoney(cents: bigint): string {
  return `${cents > 0n ? "+" : ""}${formatMoney(cents)}`;
}

/** A four-decimal price for display: two decimals unless more are needed ("$228.5067"). */
export function formatPrice4(value: bigint): string {
  if (value % 100n === 0n) return formatMoney(value / 100n);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = (magnitude / 10_000n).toLocaleString("en-US");
  const fraction = (magnitude % 10_000n).toString().padStart(4, "0");
  return `${negative ? "−" : ""}$${whole}.${fraction}`;
}

/** `part / whole` as a signed percent with two decimals ("+1.25%"); `null` when `whole` is 0. */
export function formatPercentOf(part: bigint, whole: bigint): string | null {
  if (whole === 0n) return null;
  // Basis points, rounded, from integers only.
  const bp = divideRounded(part * 10_000n, whole < 0n ? -whole : whole);
  const negative = bp < 0n;
  const magnitude = negative ? -bp : bp;
  const text = `${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}%`;
  return bp === 0n ? `0.00%` : `${negative ? "−" : "+"}${text}`;
}
