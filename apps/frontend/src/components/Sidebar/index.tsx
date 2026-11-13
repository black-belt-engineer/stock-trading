import { NavLink } from "react-router";
import { ConnectionStatus } from "../ConnectionStatus";
import { FeedIcon } from "../icons";
import { navItems } from "../navItems";
import type { JSX, RefObject } from "react";

type Props = {
  status: "connecting" | "live" | "reconnecting" | "disconnected";
  attempts: number;
  /** Whether the feed drawer is open (medium width only). */
  feedOpen: boolean;
  onToggleFeed: () => void;
  feedToggleRef: RefObject<HTMLButtonElement | null>;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Narrow: a header row with the brand and the connection status; navigation is
 * in the bottom tab bar. Medium: an icon rail, labels visually hidden but still
 * read out, plus the feed drawer toggle. Wide: the full sidebar.
 */
export function Sidebar({ status, attempts, feedOpen, onToggleFeed, feedToggleRef }: Props): JSX.Element {
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
          {navItems.map(({ label, to, Icon }) => (
            // NavLink sets aria-current="page" on the active link by itself.
            <NavLink
              key={to}
              to={to}
              end
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
      <ConnectionStatus status={status} attempts={attempts} />
    </aside>
  );
}
