import type { JSX } from "react";

/**
 * Hand-drawn 20×20 line icons for the navigation. Always decorative: the
 * control that holds one carries the accessible name.
 */
function Icon({ children }: { children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      {children}
    </svg>
  );
}

/** Four tiles: the quotes grid. */
export function QuotesIcon(): JSX.Element {
  return (
    <Icon>
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </Icon>
  );
}

/** A pulse line: the live feed. */
export function FeedIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M2.5 10h3.5l2-5 4 10 2-5h3.5" />
    </Icon>
  );
}

/** A clock with a back arrow: the tick history. */
/** Three candles: the chart. */
export function ChartIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M5 3.5v13" />
      <rect x="3.5" y="6" width="3" height="6" rx="0.6" />
      <path d="M10 2.5v12" />
      <rect x="8.5" y="4.5" width="3" height="7" rx="0.6" />
      <path d="M15 6v11" />
      <rect x="13.5" y="9" width="3" height="5" rx="0.6" />
    </Icon>
  );
}

export function HistoryIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" />
      <path d="M3.5 3v3.4h3.4" />
      <path d="M10 6.5V10l2.5 1.5" />
    </Icon>
  );
}

/** A door with an arrow leaving it: log out. */
export function LogoutIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3" />
      <path d="M12.5 6.5 16 10l-3.5 3.5" />
      <path d="M16 10H8" />
    </Icon>
  );
}

/** Three sliders: settings. */
export function SettingsIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M3.5 5.5h6M13.5 5.5h3" />
      <circle cx="11.5" cy="5.5" r="2" />
      <path d="M3.5 10h2M9.5 10h7" />
      <circle cx="7.5" cy="10" r="2" />
      <path d="M3.5 14.5h7.5M15 14.5h1.5" />
      <circle cx="13" cy="14.5" r="2" />
    </Icon>
  );
}

/** A sun: the light theme. */
export function SunIcon(): JSX.Element {
  return (
    <Icon>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
    </Icon>
  );
}

/** A crescent moon: the dark theme. */
export function MoonIcon(): JSX.Element {
  return (
    <Icon>
      <path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2Z" />
    </Icon>
  );
}

/** A monitor: follow the system's theme. */
export function SystemIcon(): JSX.Element {
  return (
    <Icon>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 16.5h6M10 13.5v3" />
    </Icon>
  );
}
