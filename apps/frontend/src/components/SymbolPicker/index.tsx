import { useMemo } from "react";
import type { ChangeEvent, JSX } from "react";
import type { ActiveStock } from "../../types";
import { focusRing } from "../pageStyles";

type Props = {
  stocks: ActiveStock[];
  /** The selected symbol, or `null` for none (shows "Choose…"). */
  value: string | null;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

/** A native select of every listed symbol, grouped by sector like the dashboard's filter. */
export function SymbolPicker({ stocks, value, onChange }: Props): JSX.Element {
  const groups = useMemo(() => {
    const bySector = new Map<string, ActiveStock[]>();
    for (const stock of stocks) bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
    return [...bySector.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stocks]);

  return (
    <label className="flex max-w-full min-w-0 items-center gap-2 text-[12px] tracking-widest text-secondary uppercase">
      Symbol
      <select
        value={value ?? ""}
        onChange={onChange}
        disabled={stocks.length === 0}
        className={
          "h-8 min-w-0 flex-1 cursor-pointer truncate rounded-md border border-default bg-input px-2 text-[13px] tracking-normal text-primary normal-case " +
          `hover:border-strong ${focusRing}`
        }
      >
        {value === null && (
          <option value="" disabled>
            Choose…
          </option>
        )}
        {groups.map(([sector, items]) => (
          <optgroup key={sector} label={sector}>
            {items.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} · {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
