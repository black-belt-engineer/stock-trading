export function formatPrice(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatChange(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const arrow = value >= 0 ? "▲" : "▼";
  const sign = value >= 0 ? "+" : "";
  return `${arrow} ${sign}${value.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
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
