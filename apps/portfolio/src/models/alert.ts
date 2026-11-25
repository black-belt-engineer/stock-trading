/** Most active (not yet triggered) alerts one user can have. A further create gets `409`. */
export const ACTIVE_ALERT_LIMIT = 50;

/** How many triggered alerts the list returns, newest first. Older ones stay stored. */
export const ALERT_HISTORY_LIMIT = 50;

export type AlertDirection = "above" | "below";

/**
 * A money amount as the API carries it: a decimal string with at most two decimals, no sign,
 * no exponent ("228.5", "0.01", "1200"). The service never does arithmetic on a float. (Fastify's
 * default type coercion turns a JSON number into its shortest decimal string first, so `230.1`
 * is accepted as "230.1"; the app always sends strings.)
 */
export const PRICE_PATTERN = "^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$";
const PRICE_REGEX = new RegExp(PRICE_PATTERN);

/** `"228.5"` → 22850. `null` for anything {@link PRICE_PATTERN} refuses. Pure string arithmetic. */
export function centsOf(amount: string): number | null {
  if (!PRICE_REGEX.test(amount)) return null;
  const [whole = "0", fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 22850 → `"228.50"`. */
export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * Whether a price meets an alert's condition. `>=` and `<=`, not equality and not "crossed since
 * the last tick": a price can jump past the threshold between two ticks.
 */
export function conditionMet(direction: AlertDirection, thresholdCents: number, priceCents: number): boolean {
  return direction === "above" ? priceCents >= thresholdCents : priceCents <= thresholdCents;
}

export type Alert = {
  id: string;
  symbol: string;
  direction: AlertDirection;
  /** Decimal string, two decimals ("228.50"). */
  threshold: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 once triggered, else `null`. A triggered alert is history; it never fires again. */
  triggeredAt: string | null;
  /** The price the triggering client saw, two decimals, else `null`. */
  triggeredPrice: string | null;
  /** False once the symbol has left the registry: it gets no quotes, so it cannot fire. */
  listed: boolean;
};

export type AlertsResponse = {
  /** Active alerts, oldest first. */
  active: Alert[];
  /** Triggered alerts, most recently triggered first, at most {@link ALERT_HISTORY_LIMIT}. */
  history: Alert[];
};

export type TriggerResponse = {
  /** True only for the one call that set `triggeredAt`; every later call (another tab) gets false. */
  first: boolean;
  alert: Alert;
};
