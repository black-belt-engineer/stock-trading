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
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v)} style={{ display: "flex", gap: 8 }}>
      {pills.map((pill) => {
        const active = value === pill.id;
        return (
          <ToggleGroup.Item
            key={pill.id}
            value={pill.id}
            disabled={pill.disabled}
            style={{
              height: 28,
              padding: "0 14px",
              borderRadius: 20,
              border: active ? "1px solid var(--accent-teal)" : "1px solid var(--border-subtle)",
              background: active ? "var(--accent-teal-dim)" : "transparent",
              color: active ? "var(--accent-teal)" : "var(--text-secondary)",
              opacity: pill.disabled ? 0.4 : 1,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {pill.label}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
