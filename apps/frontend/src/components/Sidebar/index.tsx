import { NavLink } from "react-router";
import { AlertsBell } from "../../alerts/AlertsBell";
import { AccountControls } from "../AccountControls";
import { ConnectionStatus } from "../ConnectionStatus";
import { FeedIcon } from "../icons";
import { navItems } from "../navItems";
import { ThemeMenu } from "../ThemeMenu";
import type { JSX, RefObject } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
  /** Whether the feed drawer is open (medium width only). */
  feedOpen: boolean;
  onToggleFeed: () => void;
  feedToggleRef: RefObject<HTMLButtonElement | null>;
  userName: string;
  onLogOut: () => Promise<void>;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Narrow: a header row with the brand and the connection status; navigation is
 * in the bottom tab bar. Medium: an icon rail, labels visually hidden but still
 * read out, plus the feed drawer toggle. Wide: the full sidebar. The account
 * controls sit next to the connection status: at the end of the header row, or
 * at the foot of the rail and the sidebar.
 */
export function Sidebar({ status, attempts, feedOpen, onToggleFeed, feedToggleRef, userName, onLogOut }: Props): JSX.Element {
  return (
    <aside
      className={
        "row-start-1 flex items-center justify-between gap-3 border-b border-subtle bg-sidebar px-4 py-2.5 md:col-start-1 " +
        "md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-2 md:pt-[18px] md:pb-3.5 xl:px-3.5"
      }
    >
      <div className="md:grid md:gap-[18px]">
        <div className="font-bold tracking-[0.08em] text-brand md:px-1.5 md:max-xl:text-center">
          {/* The rail is too narrow for the word mark. */}
          <span aria-hidden="true" className="hidden md:max-xl:inline">
            ST
          </span>
          <span className="md:max-xl:sr-only">STREAMTICK</span>
        </div>
        <nav aria-label="Main" className="hidden gap-1 md:grid">
          {navItems.map(({ label, to, Icon, end }) => (
            // NavLink sets aria-current="page" on the active link by itself.
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                "flex h-10 w-full items-center gap-2.5 rounded-lg border border-l-[3px] px-3 transition-colors duration-150 " +
                `md:max-xl:justify-center md:max-xl:px-0 ${focusRing} ` +
                (isActive
                  ? "border-brand bg-brand-dim text-brand"
                  : "border-transparent text-secondary hover:bg-elevated hover:text-primary")
              }
            >
              <Icon />
              <span className="md:max-xl:sr-only">{label}</span>
            </NavLink>
          ))}
          {/* The feed has its own column on wide screens and its own tab on narrow ones. */}
          <button
            ref={feedToggleRef}
            type="button"
            onClick={onToggleFeed}
            aria-expanded={feedOpen}
            aria-controls="live-feed"
            title="Live feed"
            className={
              "hidden h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-l-[3px] transition-colors duration-150 md:max-xl:flex " +
              `${focusRing} ` +
              (feedOpen
                ? "border-brand bg-brand-dim text-brand"
                : "border-transparent text-secondary hover:bg-elevated hover:text-primary")
            }
          >
            <FeedIcon />
            <span className="sr-only">Live feed</span>
          </button>
        </nav>
      </div>
      <div className="flex min-w-0 items-center gap-2 md:grid md:gap-3">
        <AlertsBell />
        <ThemeMenu />
        <AccountControls name={userName} onLogOut={onLogOut} />
        <ConnectionStatus status={status} attempts={attempts} />
      </div>
    </aside>
  );
}
