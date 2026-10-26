import type { Theme } from "@32dashboards/schema";
import { PALETTES, type Palette } from "./palettes.js";
import { validateTheme } from "./validateTheme.js";

/*
 * Suggests an event's colors from its logo: the logo's main color becomes
 * the accent, a second color (or a neighbor of the first) the secondary, and
 * the background is a deep shade of the main color. The result is nudged
 * until it passes validateTheme (readable from across a room, broadcast-safe),
 * so a suggestion never starts an event with warnings.
 */

type Colors = Palette["colors"];
type Hsl = { h: number; s: number; l: number };

const LEGAL_MIN = 16;
const LEGAL_MAX = 235;

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
      : max === gn
        ? ((bn - rn) / d + 2) * 60
        : ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    // Keep every channel in the broadcast-legal range.
    return Math.min(LEGAL_MAX, Math.max(LEGAL_MIN, Math.round(value * 255)));
  };
  return `#${[channel(0), channel(8), channel(4)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** The logo's colorful hues, most prominent first: average hue and saturation, weighted by how much there is. */
export function prominentHues(rgba: ArrayLike<number>): { h: number; s: number; weight: number }[] {
  const buckets = Array.from({ length: 24 }, () => ({ x: 0, y: 0, saturation: 0, count: 0 }));
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const { h, s, l } = rgbToHsl(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    // Near-white, near-black and grays don't say much about a brand.
    if (s < 0.25 || l < 0.12 || l > 0.92) continue;
    const bucket = buckets[Math.floor(h / 15) % 24]!;
    // Hues are averaged as angles, weighted by saturation.
    bucket.x += Math.cos((h * Math.PI) / 180) * s;
    bucket.y += Math.sin((h * Math.PI) / 180) * s;
    bucket.saturation += s;
    bucket.count += 1;
  }
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      h: ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360,
      s: b.saturation / b.count,
      weight: b.saturation,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Lightens a color until it reads on both backgrounds, as validateTheme requires. */
function readableOn(
  hsl: Hsl,
  colors: Omit<Colors, "accentColor" | "secondaryColor">,
  field: "accentColor" | "secondaryColor",
) {
  for (let l = hsl.l; l <= 0.92; l += 0.02) {
    const hex = hslToHex({ ...hsl, l });
    const theme = { ...PALETTES[0]!.colors, ...colors, [field]: hex } as Colors;
    if (!validateTheme(theme as Theme).some((issue) => issue.field === field)) return hex;
  }
  return null;
}

/**
 * Colors suggested by an image's pixels (RGBA, as from a canvas), or null
 * when the image has no colorful pixels to go on (an all-black logo).
 */
export function themeFromPixels(rgba: ArrayLike<number>): Colors | null {
  const hues = prominentHues(rgba);
  const main = hues[0];
  if (!main) return null;
  const second = hues.find((c) => hueDistance(c.h, main.h) >= 35 && c.weight >= main.weight * 0.15);
  const secondHue = second ? second.h : (main.h + 40) % 360;

  const backgrounds = {
    backgroundFrom: hslToHex({ h: main.h, s: 0.45, l: 0.1 }),
    backgroundTo: hslToHex({ h: main.h, s: 0.45, l: 0.17 }),
  };
  const saturation = (s: number) => Math.min(0.85, Math.max(0.55, s));
  const accent = readableOn({ h: main.h, s: saturation(main.s || 0.7), l: 0.55 }, backgrounds, "accentColor");
  const secondary = readableOn(
    { h: secondHue, s: saturation(second?.s || main.s || 0.6), l: 0.65 },
    backgrounds,
    "secondaryColor",
  );
  if (!accent || !secondary) return null;
  const colors = { accentColor: accent, secondaryColor: secondary, ...backgrounds };
  return validateTheme({ ...colors, logoUrl: null, fontDisplay: "", fontMono: "" }).length === 0 ? colors : null;
}
