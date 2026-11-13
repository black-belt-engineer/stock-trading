import { NavLink } from "react-router";
import { ConnectionStatus } from "../ConnectionStatus";
import type { JSX } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
};

/**
 * Only pages that exist are listed. Chart, History and Settings come back with
 * their features (M4, M3, A4) instead of sitting here disabled.
 */
const nav = [{ label: "Quotes", to: "/" }];

export function Sidebar({ status, attempts }: Props): JSX.Element {
  return (
    <aside className="flex w-[220px] flex-col justify-between border-r border-subtle bg-sidebar px-3.5 pt-[18px] pb-3.5">
      <div>
        <div className="mb-[18px] px-1.5 font-bold tracking-[0.08em] text-brand">STREAMTICK</div>
        <nav aria-label="Main" className="grid gap-1">
          {nav.map((item) => (
            // NavLink sets aria-current="page" on the active link by itself.
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                "flex h-9 w-full items-center rounded-lg border border-l-[3px] px-3 transition-colors duration-150 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
                (isActive
                  ? "border-brand bg-brand-dim text-brand"
                  : "border-transparent text-secondary hover:bg-elevated hover:text-primary")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <ConnectionStatus status={status} attempts={attempts} />
    </aside>
  );
}
