import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import type { Theme } from "@32dashboards/schema";
import "./theme.css";

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

/** The background styles a theme can pick. */
const BACKGROUNDS: Record<NonNullable<Theme["backgroundStyle"]>, string> = {
  gradient: "linear-gradient(160deg, var(--color-bg-from), var(--color-bg-to))",
  solid: "var(--color-bg-from)",
  // A soft pool of the accent behind the top of the screen, where the total sits.
  glow: "radial-gradient(ellipse 60% 45% at 50% 22%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%), linear-gradient(160deg, var(--color-bg-from), var(--color-bg-to))",
};

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
        "--color-text": theme.textColor ?? "#f4f6ff",
        color: "var(--color-text)",
        "--font-display": fontStack(theme.fontDisplay, DISPLAY_FALLBACK),
        "--font-mono": fontStack(theme.fontMono, MONO_FALLBACK),
        // Set here, not inherited from body: body resolves --font-display at
        // :root, before this element overrides it.
        fontFamily: "var(--font-display)",
        background: BACKGROUNDS[theme.backgroundStyle ?? "gradient"],
        minHeight: "100vh",
        width: "100%",
      }) as CSSProperties,
    [theme],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-root" style={style}>
        {theme.backgroundMotion && <div className="theme-drift" aria-hidden="true" />}
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
