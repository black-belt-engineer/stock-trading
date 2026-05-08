import { ConnectionStatus } from "../ConnectionStatus";
import type { JSX } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
};

const nav = [
  { label: "Quotes", active: true },
  { label: "Chart", active: false },
  { label: "History", active: false },
  { label: "Settings", active: false },
];

export function Sidebar({ status, attempts }: Props): JSX.Element {
  return (
    <aside
      style={{
        width: 220,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "18px 14px 14px",
      }}
    >
      <div>
        <div style={{ color: "var(--accent-teal)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 18, paddingInline: 6 }}>
          STREAMTICK
        </div>
        <nav style={{ display: "grid", gap: 4 }}>
          {nav.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={!item.active}
              style={{
                width: "100%",
                textAlign: "left",
                height: 36,
                borderRadius: 8,
                border: item.active ? "1px solid var(--accent-teal)" : "1px solid transparent",
                borderLeft: item.active ? "3px solid var(--accent-teal)" : "3px solid transparent",
                background: item.active ? "var(--accent-teal-dim)" : "transparent",
                color: item.active ? "var(--accent-teal)" : "var(--text-secondary)",
                opacity: item.active ? 1 : 0.55,
                cursor: item.active ? "default" : "not-allowed",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <ConnectionStatus status={status} attempts={attempts} />
    </aside>
  );
}
