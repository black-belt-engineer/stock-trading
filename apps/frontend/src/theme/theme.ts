/**
 * Light and dark theme (D4). The choice is "system", "light" or "dark"; "system"
 * follows the operating system's preference. The resolved theme is the
 * `data-theme` attribute on <html>, which `tokens.css` reads.
 *
 * The inline script in `index.html` does the same before the app loads, so a
 * reload never flashes the wrong theme. Keep the two in step: the storage key,
 * the values and the `theme-color` colours are repeated there.
 */

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

/** A display preference of this browser, beside `streamtick.quotes.view`. */
export const THEME_STORAGE_KEY = "streamtick.theme";

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** `--bg-base` of each theme, for the browser chrome (`<meta name="theme-color">`). */
const THEME_COLOR: Record<Theme, string> = { dark: "#0c0e12", light: "#f3f4f7" };

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

/** The stored choice; "system" when there is none or storage is unavailable. */
export function readThemeChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Stores the choice. "system" removes the key, so a later default change reaches this browser. */
export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not remembered; the page still switches until it is left.
  }
}

export function resolveTheme(choice: ThemeChoice, systemPrefersLight: boolean): Theme {
  if (choice === "system") return systemPrefersLight ? "light" : "dark";
  return choice;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}
