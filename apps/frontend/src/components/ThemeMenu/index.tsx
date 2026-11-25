import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { JSX } from "react";
import { useTheme } from "../../theme/ThemeProvider";
import { isThemeChoice, THEME_CHOICES } from "../../theme/theme";
import type { ThemeChoice } from "../../theme/theme";
import { MoonIcon, SunIcon, SystemIcon } from "../icons";
import { focusRing } from "../pageStyles";

const ICONS: Record<ThemeChoice, () => JSX.Element> = { system: SystemIcon, light: SunIcon, dark: MoonIcon };

const itemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] text-secondary outline-none select-none " +
  "data-highlighted:bg-elevated data-highlighted:text-primary data-[state=checked]:text-brand";

/**
 * The sidebar's theme control (D4, owner decision): one button showing the
 * current choice, opening a menu of three radio items. Narrow (header row) and
 * medium (icon rail): the icon only, the choice in the name and tooltip. Wide:
 * "Theme: System" beside the icon, like the account controls below it.
 */
export function ThemeMenu(): JSX.Element {
  const { choice, setChoice } = useTheme();
  const label = THEME_CHOICES.find((c) => c.value === choice)?.label ?? "System";
  const CurrentIcon = ICONS[choice];

  return (
    // Not modal and not portalled: a modal menu hides the rest of the page from
    // assistive technology, and a portal would put the menu outside every landmark.
    // It still closes on Escape, Tab and a click elsewhere, and positions itself as
    // `fixed`, so the sidebar does not clip it.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        title={`Theme: ${label}`}
        className={
          "flex h-8 cursor-pointer items-center gap-2.5 rounded-md border border-default px-2 text-[13px] text-secondary transition-colors duration-150 " +
          "hover:text-primary data-[state=open]:text-primary " +
          "md:h-10 md:w-full md:rounded-lg md:border-transparent md:px-3 md:text-[14px] md:hover:bg-elevated md:max-xl:justify-center md:max-xl:px-0 " +
          focusRing
        }
      >
        <CurrentIcon />
        <span className="sr-only xl:not-sr-only">Theme: {label}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="z-50 min-w-40 rounded-lg border border-default bg-surface p-1 shadow-dialog"
      >
        <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] tracking-widest text-secondary uppercase">
          Theme
        </DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={choice} onValueChange={(v) => isThemeChoice(v) && setChoice(v)}>
          {THEME_CHOICES.map(({ value, label: itemLabel }) => {
            const ItemIcon = ICONS[value];
            return (
              <DropdownMenu.RadioItem key={value} value={value} className={itemClass}>
                <ItemIcon />
                <span className="flex-1">{itemLabel}</span>
                <DropdownMenu.ItemIndicator aria-hidden="true">✓</DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            );
          })}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
