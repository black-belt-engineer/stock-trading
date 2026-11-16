import type { JSX } from "react";
import { ChartIcon, HistoryIcon, QuotesIcon, SettingsIcon } from "./icons";

export type NavItem = {
  label: string;
  to: string;
  Icon: () => JSX.Element;
  /** Active only on exactly this path; otherwise also on paths below it (`/history/AAPL`). */
  end: boolean;
};

/**
 * Pages in the main navigation, shared by the sidebar and the bottom tab bar.
 * Only pages that exist are listed.
 */
export const navItems: NavItem[] = [
  { label: "Quotes", to: "/", Icon: QuotesIcon, end: true },
  { label: "Chart", to: "/chart", Icon: ChartIcon, end: false },
  { label: "History", to: "/history", Icon: HistoryIcon, end: false },
  { label: "Settings", to: "/settings", Icon: SettingsIcon, end: true },
];
