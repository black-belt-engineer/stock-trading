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
    <div className="flex items-center gap-2 rounded-lg border border-subtle bg-elevated px-3 py-2.5">
      <span className={`size-2 rounded-full motion-reduce:animate-none ${dot}`} />
      <span className={`font-medium ${text}`}>{label}</span>
    </div>
  );
}
