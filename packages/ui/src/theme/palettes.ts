import type { Theme } from "@32dashboards/schema";

/*
 * Starting points for an event's colors. Each passes validateTheme (readable
 * contrast, broadcast-safe), which a test checks, so picking one never
 * starts an event with warnings. Events then adjust them to their brand.
 */

export interface Palette {
  name: string;
  colors: Pick<Theme, "accentColor" | "secondaryColor" | "backgroundFrom" | "backgroundTo" | "textColor">;
}

/** The default text color for dark palettes; light palettes set their own. */
export const LIGHT_TEXT = "#f4f6ff";

const dark = (
  name: string,
  accentColor: string,
  secondaryColor: string,
  backgroundFrom: string,
  backgroundTo: string,
): Palette => ({
  name,
  colors: { accentColor, secondaryColor, backgroundFrom, backgroundTo, textColor: LIGHT_TEXT },
});

export const PALETTES: Palette[] = [
  dark("Midnight gold", "#ebc81e", "#4dd0e1", "#181c2a", "#23284a"),
  dark("Ocean", "#5fd4e6", "#9ab8eb", "#10203a", "#163a5a"),
  dark("Forest", "#a8e063", "#e8d27a", "#13261c", "#1d3b2a"),
  dark("Berry", "#eb8fb1", "#c9a7eb", "#2a1428", "#3d1c3c"),
  dark("Ember", "#eba552", "#ebd27a", "#2a1712", "#40221a"),
  dark("Charcoal", "#e6e6e6", "#8fb3d9", "#1a1a1e", "#2a2a30"),
  dark("Royal", "#e6c35c", "#9fb4eb", "#161a3d", "#25285e"),
  dark("Lagoon", "#4fd1c5", "#ebc94c", "#10282f", "#143c46"),
  dark("Crimson", "#eb7a7a", "#ebc26b", "#2a1015", "#3d1820"),
  dark("Dusk", "#eb9b4f", "#e07aa0", "#2a1530", "#3f1f3a"),
  // Light palettes: dark text on a pale background, for bright rooms.
  {
    name: "Paper",
    colors: {
      accentColor: "#a8321e",
      secondaryColor: "#1f5f73",
      backgroundFrom: "#ebe6da",
      backgroundTo: "#ddd5c4",
      textColor: "#1c2230",
    },
  },
  {
    name: "Daylight",
    colors: {
      accentColor: "#1f5fa8",
      secondaryColor: "#b5451b",
      backgroundFrom: "#e2e8eb",
      backgroundTo: "#d4deeb",
      textColor: "#14213d",
    },
  },
];
