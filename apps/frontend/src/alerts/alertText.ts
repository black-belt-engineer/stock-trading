import type { PriceAlert } from "./alertsApi";
import { formatAmount } from "./money";

/** The one sentence the UI states about where alerts are evaluated (Q7). */
export const CHECKED_WHILE_OPEN = "Alerts are checked while Streamtick is open.";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** A date and time to the second, in the user's locale with a 24-hour clock ("Nov 25, 14:32:05"). */
export function formatDateTime(ms: number): string {
  return dateTimeFormat.format(ms);
}

/** "above $230.00" */
export function alertCondition(alert: Pick<PriceAlert, "direction" | "threshold">): string {
  return `${alert.direction} ${formatAmount(alert.threshold)}`;
}

/** "Reached $230.12 at Nov 25, 14:32:05", or "" before it fired. */
export function firedAtText(alert: PriceAlert): string {
  if (alert.triggeredAt === null) return "";
  const price = alert.triggeredPrice === null ? "" : `Reached ${formatAmount(alert.triggeredPrice)} at `;
  return `${price}${formatDateTime(alert.triggeredAt)}`;
}
