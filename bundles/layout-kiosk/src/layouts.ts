import { LayoutDefinitionSchema, type LayoutDefinition, type LayoutDefinitionInput } from "@32dashboards/layout-engine";
import type { SceneId } from "@32dashboards/schema/core";

/*
 * The venue-TV look, one layout per scene, as data. A new look is a new
 * entry here (or, later, operator-edited layout data); a stream output
 * would be another bundle with its own layouts for the same scenes.
 *
 * All layouts are 1920x1080 and scale to the screen. The total is always
 * the dominant element.
 */

const INFO_BAR_HEIGHT = "128px";

const main: LayoutDefinitionInput = {
  id: "kiosk-main",
  name: "Main",
  grid: {
    columns: "1fr 520px",
    rows: `88px 230px 1fr 1fr 1fr ${INFO_BAR_HEIGHT}`,
    areas: [
      "header header",
      "total total",
      "featured countdown",
      "featured announcements",
      "featured sponsors",
      "infobar infobar",
    ],
    gap: "20px",
    padding: "0 32px 24px",
  },
  slots: {
    header: { component: "header" },
    total: { component: "total", variant: "hero" },
    featured: { component: "featuredItems", options: { title: "Featured items", size: 6 } },
    countdown: { component: "countdown", options: { title: "Time left" } },
    announcements: { component: "announcements", options: { title: "Announcements" } },
    sponsors: { component: "sponsors", options: { title: "Thank you to our sponsors" } },
    infobar: { component: "infoBar" },
  },
  overlays: [{ component: "toasts" }],
};

const intermission: LayoutDefinitionInput = {
  id: "kiosk-intermission",
  name: "Intermission",
  grid: {
    columns: "1fr",
    rows: `88px 1fr 300px ${INFO_BAR_HEIGHT}`,
    areas: ["header", "intermission", "total", "infobar"],
    gap: "20px",
    padding: "0 32px 24px",
  },
  slots: {
    header: { component: "header" },
    intermission: { component: "intermission" },
    total: { component: "total", variant: "hero" },
    infobar: { component: "infoBar" },
  },
  overlays: [{ component: "toasts" }],
};

const askMe: LayoutDefinitionInput = {
  id: "kiosk-ask-me",
  name: "Ask Me",
  grid: { columns: "1fr", rows: "1fr", areas: ["askMe"] },
  slots: { askMe: { component: "askMe" } },
};

const celebration: LayoutDefinitionInput = {
  id: "kiosk-celebration",
  name: "Celebration",
  grid: { columns: "1fr", rows: "1fr", areas: ["celebration"] },
  slots: { celebration: { component: "grandCelebration" } },
};

/** Shown when no event is on screen. */
const standby: LayoutDefinitionInput = {
  id: "kiosk-standby",
  name: "Standby",
  grid: { columns: "1fr", rows: "1fr", areas: ["standby"] },
  slots: { standby: { component: "standby" } },
};

export const kioskLayoutInputs: Record<SceneId | "standby", LayoutDefinitionInput> = {
  main,
  intermission,
  askMe,
  celebration,
  standby,
};

export const kioskLayouts = Object.fromEntries(
  Object.entries(kioskLayoutInputs).map(([scene, input]) => [scene, LayoutDefinitionSchema.parse(input)]),
) as Record<SceneId | "standby", LayoutDefinition>;
