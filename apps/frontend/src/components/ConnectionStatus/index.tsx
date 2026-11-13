import type { JSX } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
};

// Class names are written out in full so Tailwind's scanner can find them.
const styles: Record<Props["status"], { text: string; dot: string }> = {
  live: { text: "text-brand", dot: "bg-brand animate-pulse-live" },
  reconnecting: { text: "text-warning", dot: "bg-warning animate-pulse-reconnecting" },
  connecting: { text: "text-warning", dot: "bg-warning animate-pulse-reconnecting" },
  disconnected: { text: "text-negative", dot: "bg-negative" },
};

export function ConnectionStatus({ status, attempts }: Props): JSX.Element {
  const label =
    status === "live"
      ? "Live"
      : status === "reconnecting"
        ? `Reconnecting${attempts > 0 ? ` x${attempts}` : ""}`
        : status === "disconnected"
          ? "Disconnected"
          : "Connecting...";
  const { text, dot } = styles[status];

  return (
    // A polite live region: screen readers hear the status change without being interrupted.
    // On the medium-width icon rail only the dot shows; the label stays readable
    // to screen readers and as a tooltip.
    <div
      role="status"
      aria-live="polite"
      title={label}
      className="flex items-center gap-2 rounded-lg border border-subtle bg-elevated px-3 py-2 md:py-2.5 md:max-xl:justify-center md:max-xl:px-0"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full motion-reduce:animate-none ${dot}`} />
      <span className={`font-medium md:max-xl:sr-only ${text}`}>{label}</span>
    </div>
  );
}
