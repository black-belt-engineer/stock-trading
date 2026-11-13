/** Shown in place of a value that does not exist yet (a symbol with no ticks). */
export const NO_VALUE = "—";

export function formatPrice(n: number | null): string {
  if (n === null) return NO_VALUE;
  const value = Number.isFinite(n) ? n : 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "+1.23%" or "-1.23%", without the arrow. */
export function formatSignedPercent(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatChange(n: number | null): string {
  if (n === null) return NO_VALUE;
  const value = Number.isFinite(n) ? n : 0;
  return `${value >= 0 ? "▲" : "▼"} ${formatSignedPercent(value)}`;
}

export function formatVolume(n: number | null): string {
  if (n === null) return NO_VALUE;
  const value = Number.isFinite(n) ? n : 0;
  return Math.round(value).toLocaleString("en-US");
}

export function formatTimeAgo(ts: number): string {
  const timestamp = Number.isFinite(ts) ? ts : 0;
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

/** The browser's time zone, for example "Europe/Berlin". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The browser's current UTC offset, for example "GMT+1". */
export function localTimeZoneOffset(at: number = Date.now()): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

const tickTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hourCycle: "h23",
});
const tickDateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hourCycle: "h23",
});

/** A tick time in the user's locale and time zone, with milliseconds; with the date when asked. */
export function formatTickTime(ms: number, withDate: boolean): string {
  return (withDate ? tickDateTimeFormat : tickTimeFormat).format(ms);
}

/** Whether two instants fall on different calendar days in the user's time zone. */
export function differentLocalDays(a: number, b: number): boolean {
  return new Date(a).toDateString() !== new Date(b).toDateString();
}
