import type { JSX } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
};

export function ConnectionStatus({ status, attempts }: Props): JSX.Element {
  const cfg =
    status === "live"
      ? { color: "var(--accent-teal)", text: "Live", anim: "pulseLive 2s infinite" }
      : status === "reconnecting"
        ? {
            color: "var(--accent-amber)",
            text: `Reconnecting${attempts > 0 ? ` x${attempts}` : ""}`,
            anim: "pulseReconnecting 0.6s infinite",
          }
        : status === "disconnected"
          ? { color: "var(--accent-red)", text: "Disconnected", anim: "none" }
          : { color: "var(--accent-amber)", text: "Connecting...", anim: "pulseReconnecting 0.6s infinite" };

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        borderRadius: 8,
        padding: "10px 12px",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: cfg.color,
          animation: cfg.anim,
        }}
      />
      <span style={{ color: cfg.color, fontWeight: 500 }}>{cfg.text}</span>
    </div>
  );
}
