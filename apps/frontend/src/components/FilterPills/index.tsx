import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { JSX } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function FilterPills({ value, onChange }: Props): JSX.Element {
  const pills = [
    { id: "all", label: "All", disabled: false },
    { id: "tech", label: "Tech", disabled: false },
    { id: "finance", label: "Finance", disabled: true },
    { id: "energy", label: "Energy", disabled: true },
  ];

  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v)} className="flex gap-2">
      {pills.map((pill) => (
        // Radix marks the selected item with data-state="on"; no JS flag needed.
        <ToggleGroup.Item
          key={pill.id}
          value={pill.id}
          disabled={pill.disabled}
          className={
            "h-7 rounded-[20px] border border-subtle px-3.5 text-[12px] font-medium text-secondary transition-colors duration-150 " +
            "data-[state=on]:border-brand data-[state=on]:bg-brand-dim data-[state=on]:text-brand " +
            "data-[state=off]:enabled:hover:border-strong data-[state=off]:enabled:hover:text-primary " +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
            "disabled:cursor-not-allowed disabled:opacity-40"
          }
        >
          {pill.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
