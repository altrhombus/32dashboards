import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import type { Theme } from "@32dashboards/schema";

const DISPLAY_FALLBACK = 'system-ui, "Segoe UI", Roboto, sans-serif';
const MONO_FALLBACK = 'ui-monospace, "Cascadia Mono", Consolas, "Roboto Mono", monospace';

/**
 * The theme's font first, then fallbacks of the same kind, so a font that
 * isn't installed on the kiosk degrades to a similar face instead of the
 * browser's default serif.
 */
export function fontStack(name: string, fallback: string): string {
  const cleaned = name.replace(/["\\;{}]/g, "").trim();
  return cleaned ? `"${cleaned}", ${fallback}` : fallback;
}

const ThemeContext = createContext<Theme | null>(null);

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme must be called within a <ThemeProvider>");
  }
  return theme;
}

export interface ThemeProviderProps {
  theme: Theme;
  children: ReactNode;
}

/**
 * Applies an event's theme as CSS custom properties at runtime (not at
 * build time) -- this is what makes swapping an event's branding a config
 * change instead of a rebuild.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const style = useMemo(
    () =>
      ({
        "--color-accent": theme.accentColor,
        "--color-secondary": theme.secondaryColor,
        "--color-bg-from": theme.backgroundFrom,
        "--color-bg-to": theme.backgroundTo,
        "--font-display": fontStack(theme.fontDisplay, DISPLAY_FALLBACK),
        "--font-mono": fontStack(theme.fontMono, MONO_FALLBACK),
        // Set here, not inherited from body: body resolves --font-display at
        // :root, before this element overrides it.
        fontFamily: "var(--font-display)",
        background: "linear-gradient(160deg, var(--color-bg-from), var(--color-bg-to))",
        minHeight: "100vh",
        width: "100%",
      }) as CSSProperties,
    [theme],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-root" style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
