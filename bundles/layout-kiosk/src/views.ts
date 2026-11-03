import type { ScreenView } from "@32dashboards/schema/core";

/** What people call each scene (and standby), for pickers and labels. */
export const VIEW_NAMES: Record<ScreenView, string> = {
  welcome: "Welcome",
  main: "Main",
  intermission: "Intermission",
  askMe: "Ask Me",
  celebration: "Celebration",
  standby: "Standby",
};
