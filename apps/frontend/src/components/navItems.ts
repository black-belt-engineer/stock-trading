import type { JSX } from "react";
import { HistoryIcon, QuotesIcon } from "./icons";

export type NavItem = {
  label: string;
  to: string;
  Icon: () => JSX.Element;
  /** Active only on exactly this path; otherwise also on paths below it (`/history/AAPL`). */
  end: boolean;
};

/**
 * Pages in the main navigation, shared by the sidebar and the bottom tab bar.
 * Only pages that exist are listed. Chart and Settings come back with their
 * features (M4, A4) instead of sitting here disabled.
 */
export const navItems: NavItem[] = [
  { label: "Quotes", to: "/", Icon: QuotesIcon, end: true },
  { label: "History", to: "/history", Icon: HistoryIcon, end: false },
];
