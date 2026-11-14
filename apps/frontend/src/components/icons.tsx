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
