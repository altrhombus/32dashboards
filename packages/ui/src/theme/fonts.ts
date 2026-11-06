/*
 * The fonts that ship with the kiosk (fonts.css bundles them, latin only),
 * so an event's look works at a venue with no internet. Themes name fonts by
 * family; a name not listed here falls back to a system font of the same kind.
 * Number fonts must have equal-width (tabular) digits, so a changing total
 * doesn't jiggle: monospaced fonts do, and so does Bitter.
 */

export interface FontChoice {
  family: string;
  /** Why someone would pick it, in a few words. */
  note: string;
}

export const DISPLAY_FONTS: FontChoice[] = [
  { family: "Montserrat", note: "Geometric, friendly" },
  { family: "Atkinson Hyperlegible", note: "Easiest to read from far away" },
  { family: "Lexend", note: "Rounded, open" },
  { family: "Bitter", note: "Slab serif, classic" },
  { family: "Oswald", note: "Tall and condensed" },
];

export const NUMBER_FONTS: FontChoice[] = [
  { family: "Share Tech Mono", note: "Digital, scoreboard-like" },
  { family: "JetBrains Mono", note: "Clean, even" },
  { family: "Roboto Mono", note: "Plain, quiet" },
  // Serifs, to match a serif look. Both have equal-width digits, so totals don't jiggle.
  { family: "Bitter", note: "Slab serif; matches Bitter words" },
  { family: "Courier Prime", note: "Typewriter serif" },
];

export const BUNDLED_FONTS = new Set([...DISPLAY_FONTS, ...NUMBER_FONTS].map((f) => f.family));
