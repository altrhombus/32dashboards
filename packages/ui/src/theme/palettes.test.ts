import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ThemeSchema } from "@32dashboards/schema";
import { BUNDLED_FONTS, DISPLAY_FONTS, NUMBER_FONTS } from "./fonts.js";
import { PALETTES } from "./palettes.js";
import { validateTheme } from "./validateTheme.js";

describe("PALETTES", () => {
  it.each(PALETTES.map((p) => [p.name, p] as const))("%s passes the color checks", (_name, palette) => {
    expect(validateTheme(ThemeSchema.parse(palette.colors))).toEqual([]);
  });

  it("starts new events on a palette that passes the checks", () => {
    expect(validateTheme(ThemeSchema.parse({}))).toEqual([]);
  });
});

describe("fonts", () => {
  it("bundles the default theme's fonts", () => {
    const defaults = ThemeSchema.parse({});
    expect(DISPLAY_FONTS.map((f) => f.family)).toContain(defaults.fontDisplay);
    expect(NUMBER_FONTS.map((f) => f.family)).toContain(defaults.fontMono);
    expect(BUNDLED_FONTS).toEqual(new Set([...DISPLAY_FONTS, ...NUMBER_FONTS].map((f) => f.family)));
  });

  it("ships every font it offers (a font can be offered for both words and numbers)", () => {
    // Tests run from the package folder (jsdom gives this file an http URL, not a path).
    const css = readFileSync(path.join(process.cwd(), "src/theme/fonts.css"), "utf8");
    for (const family of BUNDLED_FONTS) {
      expect(css, family).toContain(`@fontsource/${family.toLowerCase().replace(/ /g, "-")}/`);
    }
  });
});
