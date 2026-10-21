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
    expect(BUNDLED_FONTS.size).toBe(DISPLAY_FONTS.length + NUMBER_FONTS.length);
  });
});
