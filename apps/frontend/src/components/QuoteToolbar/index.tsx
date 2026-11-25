import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useState } from "react";
import type { ChangeEvent, JSX, KeyboardEvent, ReactNode, Ref } from "react";
import { focusRing } from "../pageStyles";
import { parseSort, sortParam, SORT_OPTIONS } from "../../utils/quoteView";
import type { QuoteSort } from "../../utils/quoteView";
import { isQuoteView } from "../../hooks/useQuoteView";
import type { QuoteView } from "../../hooks/useQuoteView";
import { pillClass } from "../SectorFilter";

const fieldClass =
  "h-8 min-w-0 rounded-md border border-default bg-input px-2 text-[13px] tracking-normal text-primary normal-case " +
  `hover:border-strong ${focusRing}`;

const labelClass = "flex min-w-0 items-center gap-2 text-[12px] tracking-widest text-secondary uppercase";

/** The row above the grid: search, sort and whatever else the page adds (the view toggle). */
export function QuoteToolbar({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">{children}</div>;
}

type SearchProps = {
  /** The query as the URL has it (trimmed). */
  value: string;
  onChange: (query: string) => void;
  ref?: Ref<HTMLInputElement>;
};

/**
 * The search box. It keeps what the user typed, spaces included, and reports the
 * trimmed query; it takes the URL's value only when that changes from elsewhere
 * (Back, a link, Clear), so typing never fights a navigation.
 */
export function QuoteSearch({ value, onChange, ref }: SearchProps): JSX.Element {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText((current) => (current.trim() === value ? current : value));
  }, [value]);

  const onInput = (event: ChangeEvent<HTMLInputElement>): void => {
    setText(event.target.value);
    onChange(event.target.value.trim());
  };

  // Esc empties the box. Chrome does this for type="search" by itself; Firefox does not.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Escape" || text === "") return;
    event.preventDefault();
    setText("");
    onChange("");
  };

  return (
    <label className={`${labelClass} grow basis-56`}>
      Search
      <input
        ref={ref}
        type="search"
        value={text}
        onChange={onInput}
        onKeyDown={onKeyDown}
        placeholder="Symbol or company"
        autoComplete="off"
        spellCheck={false}
        className={`${fieldClass} w-full flex-1 placeholder:text-secondary`}
      />
    </label>
  );
}

type SortProps = {
  value: QuoteSort;
  onChange: (sort: QuoteSort) => void;
};

export function SortSelect({ value, onChange }: SortProps): JSX.Element {
  return (
    <label className={labelClass}>
      Sort
      <select
        value={sortParam(value)}
        onChange={(event) => onChange(parseSort(event.target.value))}
        className={`${fieldClass} cursor-pointer`}
      >
        {SORT_OPTIONS.map(({ sort, label }) => (
          <option key={sortParam(sort)} value={sortParam(sort)}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

type ViewProps = {
  value: QuoteView;
  onChange: (view: QuoteView) => void;
};

/** Cards or table (D3), as two pills like the sector filter. */
export function ViewToggle({ value, onChange }: ViewProps): JSX.Element {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Clicking the selected pill would empty the group; one view is always on.
      onValueChange={(v) => isQuoteView(v) && onChange(v)}
      aria-label="View"
      className="flex shrink-0 gap-1.5"
    >
      <ToggleGroup.Item value="cards" className={pillClass}>
        Cards
      </ToggleGroup.Item>
      <ToggleGroup.Item value="table" className={pillClass}>
        Table
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
