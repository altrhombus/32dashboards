import type { Theme } from "@32dashboards/schema";

/*
 * Checks an event's colors against the display rules: readable text (WCAG
 * contrast) and broadcast-safe values. Venue TVs forgive what broadcast
 * doesn't, so out-of-range colors are warnings, not errors.
 */

/** Body text color, from tokens.css. */
export const TEXT_COLOR = "#f4f6ff";

export interface ThemeIssue {
  level: "error" | "warning";
  field: keyof Theme;
  message: string;
}

type Rgb = [number, number, number];

export function parseHexColor(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1]!.length === 3 ? [...match[1]!].map((c) => c + c).join("") : match[1]!;
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** 8-bit broadcast-legal range (BT.709 "studio swing"). */
const LEGAL_MIN = 16;
const LEGAL_MAX = 235;

const COLOR_FIELDS = ["accentColor", "secondaryColor", "backgroundFrom", "backgroundTo"] as const;

export function validateTheme(theme: Theme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  const colors: Partial<Record<(typeof COLOR_FIELDS)[number], Rgb>> = {};

  for (const field of COLOR_FIELDS) {
    const rgb = parseHexColor(theme[field]);
    if (!rgb) {
      issues.push({ level: "error", field, message: `"${theme[field]}" isn't a hex color like #ffd700` });
      continue;
    }
    colors[field] = rgb;
    if (rgb.some((c) => c < LEGAL_MIN || c > LEGAL_MAX)) {
      issues.push({
        level: "warning",
        field,
        message: `${theme[field]} is outside the broadcast-safe range (each channel ${LEGAL_MIN}–${LEGAL_MAX}); it may clip or bloom on air`,
      });
    }
  }

  const text = parseHexColor(TEXT_COLOR)!;
  for (const bg of ["backgroundFrom", "backgroundTo"] as const) {
    const background = colors[bg];
    if (!background) continue;
    const textRatio = contrastRatio(text, background);
    if (textRatio < 4.5) {
      issues.push({
        level: "error",
        field: bg,
        message: `Text on ${theme[bg]} has contrast ${textRatio.toFixed(1)}:1; it needs at least 4.5:1`,
      });
    }
    for (const fg of ["accentColor", "secondaryColor"] as const) {
      const color = colors[fg];
      if (!color) continue;
      const ratio = contrastRatio(color, background);
      // Accent and secondary colors are used for large text (totals, headings): WCAG large-text minimum.
      if (ratio < 3) {
        issues.push({
          level: "error",
          field: fg,
          message: `${theme[fg]} on ${theme[bg]} has contrast ${ratio.toFixed(1)}:1; large text needs at least 3:1`,
        });
      }
    }
  }
  return issues;
}
