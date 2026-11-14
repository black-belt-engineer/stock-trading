import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { JSX } from "react";
import { pillClass } from "../SectorFilter";

export type Pill = { id: string; label: string };

type Props = {
  pills: readonly Pill[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group, for example "Time range". */
  label: string;
};

/**
 * One choice out of a few, as pills: a Radix single toggle group (one tab
 * stop, arrows move between pills). Clicking the selected pill keeps it.
 */
export function PillGroup({ pills, value, onChange, label }: Props): JSX.Element {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      aria-label={label}
      className="flex flex-wrap gap-2"
    >
      {pills.map((p) => (
        <ToggleGroup.Item key={p.id} value={p.id} className={pillClass}>
          {p.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
