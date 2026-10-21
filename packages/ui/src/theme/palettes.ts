import type { Theme } from "@32dashboards/schema";

/*
 * Starting points for an event's colors. Each passes validateTheme (readable
 * contrast, broadcast-safe), which a test checks, so picking one never
 * starts an event with warnings. Events then adjust them to their brand.
 */

export interface Palette {
  name: string;
  colors: Pick<Theme, "accentColor" | "secondaryColor" | "backgroundFrom" | "backgroundTo">;
}

export const PALETTES: Palette[] = [
  { name: "Midnight gold", colors: { accentColor: "#ebc81e", secondaryColor: "#4dd0e1", backgroundFrom: "#181c2a", backgroundTo: "#23284a" } },
  { name: "Ocean", colors: { accentColor: "#5fd4e6", secondaryColor: "#9ab8eb", backgroundFrom: "#10203a", backgroundTo: "#163a5a" } },
  { name: "Forest", colors: { accentColor: "#a8e063", secondaryColor: "#e8d27a", backgroundFrom: "#13261c", backgroundTo: "#1d3b2a" } },
  { name: "Berry", colors: { accentColor: "#eb8fb1", secondaryColor: "#c9a7eb", backgroundFrom: "#2a1428", backgroundTo: "#3d1c3c" } },
  { name: "Ember", colors: { accentColor: "#eba552", secondaryColor: "#ebd27a", backgroundFrom: "#2a1712", backgroundTo: "#40221a" } },
  { name: "Charcoal", colors: { accentColor: "#e6e6e6", secondaryColor: "#8fb3d9", backgroundFrom: "#1a1a1e", backgroundTo: "#2a2a30" } },
];
