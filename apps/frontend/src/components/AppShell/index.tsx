import type { JSX } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "../Sidebar";
import { LiveFeed } from "../LiveFeed";
import { StaleBanner } from "../StaleBanner";
import { useStreamData, useStreamStatus } from "../../stream/StreamProvider";

/** Sidebar and feed persist across routes; the centre column is the route outlet. */
export function AppShell(): JSX.Element {
  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr_300px] bg-base">
      <ShellSidebar />
      <main className="flex flex-col gap-3.5 overflow-y-auto px-5 py-[18px]">
        <StaleBanner />
        <Outlet />
      </main>
      <ShellFeed />
    </div>
  );
}

// Each reads only the context it needs, so a tick re-renders the feed but not the sidebar.
function ShellSidebar(): JSX.Element {
  const { status, reconnectAttempts } = useStreamStatus();
  return <Sidebar status={status} attempts={reconnectAttempts} />;
}

function ShellFeed(): JSX.Element {
  const { feed } = useStreamData();
  return <LiveFeed feed={feed} />;
}
