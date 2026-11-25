import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { JSX, ReactNode } from "react";
import { applyTheme, isThemeChoice, LIGHT_QUERY, readThemeChoice, resolveTheme, storeThemeChoice, THEME_STORAGE_KEY } from "./theme";
import type { Theme, ThemeChoice } from "./theme";

type ThemeContextValue = {
  choice: ThemeChoice;
  /** What is on screen: the choice, or the system's preference for "system". */
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystem(onChange: () => void): () => void {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const systemPrefersLight = (): boolean => window.matchMedia(LIGHT_QUERY).matches;

/**
 * Holds the theme choice and keeps `data-theme` on <html> in step with it. With
 * "system" a change of the system preference (automatic night mode) applies at
 * once; a choice made in another tab of this browser is followed too.
 */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [choice, setChoiceState] = useState<ThemeChoice>(readThemeChoice);
  const prefersLight = useSyncExternalStore(subscribeSystem, systemPrefersLight);
  const theme = resolveTheme(choice, prefersLight);

  useEffect(() => applyTheme(theme), [theme]);

  // `storage` fires in the other tabs only; a removed key (back to "system") has a null value.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      setChoiceState(isThemeChoice(event.newValue) ? event.newValue : readThemeChoice());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    storeThemeChoice(next);
  }, []);

  const value = useMemo(() => ({ choice, theme, setChoice }), [choice, theme, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme needs a ThemeProvider");
  return value;
}
