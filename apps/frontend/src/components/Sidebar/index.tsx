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
    <aside className="flex w-[220px] flex-col justify-between border-r border-subtle bg-sidebar px-3.5 pt-[18px] pb-3.5">
      <div>
        <div className="mb-[18px] px-1.5 font-bold tracking-[0.08em] text-brand">STREAMTICK</div>
        <nav className="grid gap-1">
          {nav.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={!item.active}
              className={
                "h-9 w-full rounded-lg border border-l-[3px] text-left transition-colors duration-150 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
                "disabled:cursor-not-allowed disabled:opacity-55 " +
                (item.active
                  ? "border-brand bg-brand-dim text-brand"
                  : "border-transparent text-secondary enabled:hover:bg-elevated enabled:hover:text-primary")
              }
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
