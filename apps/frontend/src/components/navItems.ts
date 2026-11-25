import type { JSX } from "react";
import { AlertsIcon, ChartIcon, HistoryIcon, PortfolioIcon, QuotesIcon, SettingsIcon } from "./icons";

export type NavItem = {
  label: string;
  to: string;
  Icon: () => JSX.Element;
  /** Active only on exactly this path; otherwise also on paths below it (`/history/AAPL`). */
  end: boolean;
  /**
   * Left out of the phone tab bar, which holds six tabs at 360 px. Alerts stays one tap away
   * there through the bell in the header (owner's decision, phase 17).
   */
  sidebarOnly?: boolean;
};

/**
 * Pages in the main navigation, shared by the sidebar and the bottom tab bar.
 * Only pages that exist are listed.
 */
export const navItems: NavItem[] = [
  { label: "Quotes", to: "/", Icon: QuotesIcon, end: true },
  { label: "Portfolio", to: "/portfolio", Icon: PortfolioIcon, end: true },
  { label: "Chart", to: "/chart", Icon: ChartIcon, end: false },
  { label: "History", to: "/history", Icon: HistoryIcon, end: false },
  { label: "Alerts", to: "/alerts", Icon: AlertsIcon, end: true, sidebarOnly: true },
  { label: "Settings", to: "/settings", Icon: SettingsIcon, end: true },
];
