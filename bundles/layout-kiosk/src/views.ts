import type { ScreenView } from "@32dashboards/schema/core";

/** What people call each scene (and standby), for pickers and labels. */
export const VIEW_NAMES: Record<ScreenView, string> = {
  welcome: "Welcome",
  main: "Main",
  noBids: "No bids yet",
  intermission: "Intermission",
  askMe: "Ask Me",
  liveAuction: "Live auction",
  celebration: "Celebration",
  standby: "Standby",
};
