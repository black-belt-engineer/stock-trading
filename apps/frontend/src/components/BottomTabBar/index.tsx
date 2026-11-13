import type { JSX } from "react";
import { NavLink } from "react-router";
import { FeedIcon } from "../icons";
import { navItems } from "../navItems";

type Props = {
  /** The feed tab is selected and covers the page. */
  feedOpen: boolean;
  onShowFeed: () => void;
  onShowMain: () => void;
};

const tabClass =
  "flex min-h-12 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[12px] transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
const activeClass = "text-brand";
const idleClass = "text-secondary hover:text-primary";

/**
 * Narrow screens only. The pages are links; the feed is not a page but a view
 * of the shell, so its tab is a toggle button. Picking a page tab while the
 * feed is showing returns to that page even when the route does not change.
 */
export function BottomTabBar({ feedOpen, onShowFeed, onShowMain }: Props): JSX.Element {
  return (
    <nav
      aria-label="Main"
      // Clears the home indicator on phones; the viewport meta sets viewport-fit=cover.
      className="row-start-3 flex border-t border-subtle bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {navItems.map(({ label, to, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onShowMain}
          className={({ isActive }) => `${tabClass} ${isActive && !feedOpen ? activeClass : idleClass}`}
        >
          <Icon />
          {label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={feedOpen ? onShowMain : onShowFeed}
        aria-pressed={feedOpen}
        aria-controls="live-feed"
        className={`${tabClass} ${feedOpen ? activeClass : idleClass}`}
      >
        <FeedIcon />
        Feed
      </button>
    </nav>
  );
}
