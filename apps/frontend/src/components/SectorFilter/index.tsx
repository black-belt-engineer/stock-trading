import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useRef } from "react";
import type { JSX } from "react";

export type SectorOption = {
  /** URL value, for example `health-care`. */
  id: string;
  label: string;
};

/** The pill that shows every sector; it has no `?sector=` in the URL. */
export const ALL_SECTORS = "all";

type Props = {
  sectors: SectorOption[];
  value: string;
  onChange: (value: string) => void;
};

/** Turns a sector name into its URL value: "Health Care" → "health-care". */
export function sectorId(sector: string): string {
  return sector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function SectorFilter({ sectors, value, onChange }: Props): JSX.Element {
  const pills = [{ id: ALL_SECTORS, label: "All" }, ...sectors];
  const rootRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the row scrolls sideways; bring the selected pill into
  // view (a reload with ?sector= may select one off to the right). Only the
  // row scrolls, never the page.
  useEffect(() => {
    const root = rootRef.current;
    const pill = root?.querySelector<HTMLElement>('[data-state="on"]');
    if (!root || !pill) return;
    const left = pill.offsetLeft - root.offsetLeft;
    if (left < root.scrollLeft || left + pill.offsetWidth > root.scrollLeft + root.clientWidth) {
      root.scrollLeft = left - (root.clientWidth - pill.offsetWidth) / 2;
    }
  }, [value, sectors]);

  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      value={value}
      // Clicking the selected pill would empty the group; one pill is always on.
      onValueChange={(v) => v && onChange(v)}
      aria-label="Filter by sector"
      // Narrow: one row that scrolls sideways. From md up the pills wrap.
      className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 py-1 md:flex-wrap md:overflow-visible"
    >
      {pills.map((pill) => (
        // Radix marks the selected item with data-state="on"; no JS flag needed.
        <ToggleGroup.Item
          key={pill.id}
          value={pill.id}
          className={
            "h-7 shrink-0 cursor-pointer rounded-[20px] border border-subtle px-3.5 text-[12px] font-medium whitespace-nowrap text-secondary transition-colors duration-150 " +
            "data-[state=on]:border-brand data-[state=on]:bg-brand-dim data-[state=on]:text-brand " +
            "data-[state=off]:hover:border-strong data-[state=off]:hover:text-primary " +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          }
        >
          {pill.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
