import { describe, expect, it } from "vitest";
import { ThemeSchema } from "@32dashboards/schema";
import { prominentHues, themeFromPixels } from "./fromImage.js";
import { parseHexColor } from "./validateTheme.js";
import { validateTheme } from "./validateTheme.js";

/** Pixels: [r, g, b] repeated `count` times, fully opaque. */
function pixels(...parts: [[number, number, number], number][]): number[] {
  return parts.flatMap(([[r, g, b], count]) => Array.from({ length: count }, () => [r, g, b, 255]).flat());
}

/** A color's hue in degrees, however dark it is. */
const hueOf = (hex: string) => {
  const [r, g, b] = parseHexColor(hex)!.map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return NaN;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe("prominentHues", () => {
  it("ranks the logo's colors by how much of each there is, ignoring white, black and grays", () => {
    const hues = prominentHues(
      pixels(
        [[255, 255, 255], 500],
        [[0, 0, 0], 300],
        [[128, 128, 128], 200],
        [[200, 30, 30], 80],
        [[30, 60, 200], 20],
      ),
    );
    expect(hues).toHaveLength(2);
    expect(hues[0]!.h).toBeCloseTo(0, 0);
    expect(hues[1]!.h).toBeCloseTo(228, -1);
  });

  it("ignores transparent pixels", () => {
    expect(prominentHues([200, 30, 30, 0])).toEqual([]);
  });
});

describe("themeFromPixels", () => {
  it("builds the look around the logo's main color", () => {
    const colors = themeFromPixels(pixels([[255, 255, 255], 400], [[30, 90, 200], 120], [[230, 160, 20], 40]))!;
    expect(Math.abs(hueOf(colors.accentColor) - 220)).toBeLessThan(15);
    expect(Math.abs(hueOf(colors.secondaryColor) - 38)).toBeLessThan(15);
    expect(Math.abs(hueOf(colors.backgroundFrom) - 220)).toBeLessThan(15);
  });

  it("always passes the readability and broadcast-safe checks", () => {
    for (let h = 0; h < 360; h += 7) {
      for (const [s, l] of [
        [1, 0.5],
        [0.5, 0.3],
        [0.9, 0.8],
        [0.3, 0.2],
      ] as const) {
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        const [r, g, b] = (
          h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x]
        ).map((v) => Math.round((v + m) * 255)) as [number, number, number];
        const colors = themeFromPixels(pixels([[r, g, b], 50]));
        if (!colors) continue;
        expect(validateTheme(ThemeSchema.parse(colors)), `${h},${s},${l}`).toEqual([]);
      }
    }
  });

  it("has nothing to suggest for a logo without color", () => {
    expect(themeFromPixels(pixels([[0, 0, 0], 100], [[255, 255, 255], 100]))).toBeNull();
  });
});
