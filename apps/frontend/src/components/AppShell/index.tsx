import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX, RefObject } from "react";
import { Outlet, useLocation } from "react-router";
import { Sidebar } from "../Sidebar";
import { LiveFeed } from "../LiveFeed";
import { StaleBanner } from "../StaleBanner";
import { BottomTabBar } from "../BottomTabBar";
import { useStreamData, useStreamStatus } from "../../stream/StreamProvider";

/**
 * Sidebar and feed persist across routes; the centre column is the route outlet.
 *
 * Three layouts (U2), switched in CSS only:
 * - narrow (< md, 768px): the sidebar is a header row, a bottom tab bar holds
 *   the navigation, and the feed is its own tab that takes the main area's place;
 * - medium (md to xl): the sidebar is an icon rail, and the feed is a drawer
 *   over the right edge, toggled from the rail;
 * - wide (≥ xl, 1280px): sidebar, main and feed side by side.
 *
 * `feedOpen` means "the feed tab is selected" on narrow screens and "the drawer
 * is open" on medium ones; wide screens ignore it. The shell is exactly one
 * viewport tall and each region scrolls on its own, so the sidebar and the
 * connection status stay in view.
 */
export function AppShell(): JSX.Element {
  const [feedOpen, setFeedOpen] = useState(false);
  const feedToggleRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  // A route change shows the new page, not the feed over it.
  useEffect(() => setFeedOpen(false), [pathname]);

  const toggleFeed = useCallback(() => setFeedOpen((open) => !open), []);
  const showMain = useCallback(() => setFeedOpen(false), []);

  // Closing the drawer from inside it returns focus to the rail toggle, which
  // is the only control that opens it.
  const closeDrawer = useCallback(() => {
    setFeedOpen(false);
    feedToggleRef.current?.focus();
  }, []);

  return (
    <div
      className={
        "grid h-dvh grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-base " +
        "md:grid-cols-[64px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[220px_minmax(0,1fr)_300px]"
      }
    >
      <ShellSidebar feedOpen={feedOpen} onToggleFeed={toggleFeed} feedToggleRef={feedToggleRef} />
      <main
        className={
          "row-start-2 flex min-h-0 flex-col gap-3.5 overflow-y-auto px-4 py-4 md:col-start-2 md:row-start-1 md:px-5 md:py-[18px] " +
          // On narrow screens the feed tab replaces the page. Hidden, not
          // unmounted, so the page keeps its state while the feed is shown.
          (feedOpen ? "max-md:hidden" : "")
        }
      >
        <StaleBanner />
        <Outlet />
      </main>
      {/* Backdrop for the medium-width drawer: a click beside the drawer closes it. */}
      {feedOpen && (
        <div aria-hidden="true" onClick={closeDrawer} className="fixed inset-0 z-20 hidden bg-overlay md:max-xl:block" />
      )}
      <ShellFeed open={feedOpen} onClose={closeDrawer} />
      <BottomTabBar feedOpen={feedOpen} onShowFeed={() => setFeedOpen(true)} onShowMain={showMain} />
    </div>
  );
}

// Each reads only the context it needs, so a tick re-renders the feed but not the sidebar.
function ShellSidebar(props: {
  feedOpen: boolean;
  onToggleFeed: () => void;
  feedToggleRef: RefObject<HTMLButtonElement | null>;
}): JSX.Element {
  const { status, reconnectAttempts } = useStreamStatus();
  return <Sidebar status={status} attempts={reconnectAttempts} {...props} />;
}

function ShellFeed({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { feed } = useStreamData();
  return <LiveFeed feed={feed} open={open} onClose={onClose} />;
}
