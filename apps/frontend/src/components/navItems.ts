import type { JSX } from "react";
import { QuotesIcon } from "./icons";

/**
 * Pages in the main navigation, shared by the sidebar and the bottom tab bar.
 * Only pages that exist are listed. Chart, History and Settings come back with
 * their features (M4, M3, A4) instead of sitting here disabled.
 */
export const navItems: { label: string; to: string; Icon: () => JSX.Element }[] = [
  { label: "Quotes", to: "/", Icon: QuotesIcon },
];
