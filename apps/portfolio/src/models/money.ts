/**
 * Money inside the portfolio service (P3): exact decimals held as `bigint` in units of
 * 10^-scale (cents are scale 2, `avg_cost` is scale 4). Postgres `NUMERIC` comes in as text and
 * goes out as text; no amount is ever a float here. The alerts' two-decimal helpers
 * (`centsOf`, `formatCents` in `alert.ts`) stay as they are; this is the general form.
 */

/** Cash, totals and P&L: two decimals. */
export const CASH_SCALE = 2;
/** Fill prices and average cost: four decimals (`NUMERIC(18,4)`). */
export const PRICE_SCALE = 4;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * `"228.5"` at scale 4 → `2285000n`. Accepts what Postgres prints for NUMERIC (sign, any number
 * of decimals up to `scale`). `null` for anything else, or for more decimals than `scale` holds:
 * those would need rounding, and the caller must decide that explicitly.
 */
export function parseDecimal(text: string, scale: number): bigint | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign = "", whole = "0", fraction = ""] = match;
  if (fraction.length > scale) {
    // Trailing zeros beyond the scale are harmless ("1.500000" at scale 4).
    if (/[^0]/.test(fraction.slice(scale))) return null;
  }
  const digits = fraction.slice(0, scale).padEnd(scale, "0");
  const value = BigInt(whole) * pow10(scale) + BigInt(digits === "" ? "0" : digits);
  return sign === "-" ? -value : value;
}

/** `2285000n` at scale 4 → `"228.5000"`. */
export function formatDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const unit = pow10(scale);
  const whole = (magnitude / unit).toString();
  const fraction = scale === 0 ? "" : `.${(magnitude % unit).toString().padStart(scale, "0")}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** `numerator / denominator` rounded half away from zero. `denominator` must be positive. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

/** Changes the scale of `value`; going down rounds half away from zero. */
export function rescale(value: bigint, from: number, to: number): bigint {
  if (to >= from) return value * pow10(to - from);
  return divideRounded(value, pow10(from - to));
}

/**
 * A quote's price (a JavaScript number from Redis) in whole cents, or `null` when it is not a
 * positive finite amount. The ingestor rounds prices to cents, so the rounding here only removes
 * binary noise (228.51 is stored as 228.50999…); it is the one place a float becomes money.
 */
export function centsFromQuote(price: number): bigint | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const cents = Math.round(price * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return BigInt(cents);
}
