import {
  BlockLayoutSchema,
  compileBlocks,
  normalizeBlocks,
  type BlockLayout,
  type BlockLayoutInput,
  type LayoutDefinition,
} from "@32dashboards/layout-engine/data";
import type { ScreenView } from "@32dashboards/schema/core";
import { kioskCatalog } from "./catalog.js";

/** Parses a layout and fills each block's settings with the catalog's defaults (card headings, item counts). */
const complete = (input: BlockLayoutInput): BlockLayout =>
  normalizeBlocks(BlockLayoutSchema.parse(input), kioskCatalog);

/*
 * The built-in venue-TV look, one block layout per scene, on the 24x24 snap
 * grid operators build with. They can't be edited, only copied; a screen
 * with no layout chosen for a scene shows the built-in one.
 *
 * With the default 20px gap and 24px padding, a block w cells wide is about
 * 79w - 20 px, and h cells tall about 44h - 20 px, on the 1920x1080 stage.
 * The total is always the dominant element.
 */

const main: BlockLayoutInput = {
  blocks: [
    { id: "header", component: "header", x: 0, y: 0, w: 24, h: 2 },
    { id: "total", component: "total", variant: "hero", x: 0, y: 2, w: 24, h: 6 },
    { id: "featured", component: "featuredItems", x: 0, y: 8, w: 17, h: 13 },
    { id: "countdown", component: "countdown", x: 17, y: 8, w: 7, h: 4 },
    { id: "announcements", component: "announcements", x: 17, y: 12, w: 7, h: 4 },
    { id: "sponsors", component: "sponsors", x: 17, y: 16, w: 7, h: 5 },
    { id: "infobar", component: "infoBar", x: 0, y: 21, w: 24, h: 3 },
  ],
  overlays: [{ component: "toasts" }],
};

const intermission: BlockLayoutInput = {
  blocks: [
    { id: "header", component: "header", x: 0, y: 0, w: 24, h: 2 },
    { id: "intermission", component: "intermission", x: 0, y: 2, w: 24, h: 12 },
    { id: "total", component: "total", variant: "hero", x: 0, y: 14, w: 24, h: 7 },
    { id: "infobar", component: "infoBar", x: 0, y: 21, w: 24, h: 3 },
  ],
  overlays: [{ component: "toasts" }],
};

/** One component filling the whole screen, edge to edge. */
const fullScreen = (component: string): BlockLayoutInput => ({
  gap: 0,
  padding: 0,
  blocks: [{ id: component, component, x: 0, y: 0, w: 24, h: 24 }],
});

const builtInInputs: Record<ScreenView, { name: string; blocks: BlockLayoutInput }> = {
  main: { name: "Main", blocks: main },
  intermission: { name: "Intermission", blocks: intermission },
  askMe: { name: "Ask Me", blocks: fullScreen("askMe") },
  celebration: { name: "Celebration", blocks: fullScreen("grandCelebration") },
  standby: { name: "Standby", blocks: fullScreen("standby") },
};

export const BUILT_IN_PREFIX = "builtin:";

export interface BuiltInLayout {
  id: string;
  name: string;
  view: ScreenView;
  blocks: BlockLayout;
  layout: LayoutDefinition;
}

/** Built-in layouts by the view they were made for. Ids are `builtin:<view>`. */
export const builtInLayouts = Object.fromEntries(
  Object.entries(builtInInputs).map(([view, { name, blocks }]) => {
    const id = `${BUILT_IN_PREFIX}${view}`;
    const full = complete(blocks);
    return [view, { id, name, view, blocks: full, layout: compileBlocks(full, { id, name }) }];
  }),
) as Record<ScreenView, BuiltInLayout>;

export function builtInById(id: string): BuiltInLayout | undefined {
  return Object.values(builtInLayouts).find((b) => b.id === id);
}

export const TEMPLATE_PREFIX = "template:";

/** Starting points for a new layout. Not shown on any screen by themselves. */
const templateInputs: Record<string, { name: string; description: string; blocks: BlockLayoutInput }> = {
  blank: {
    name: "Blank",
    description: "An empty screen.",
    blocks: { blocks: [], overlays: [{ component: "toasts" }] },
  },
  bigTotal: {
    name: "Big total",
    description: "The total, as big as it gets, with the call to action and the info bar.",
    blocks: {
      blocks: [
        { id: "header", component: "header", x: 0, y: 0, w: 24, h: 2 },
        { id: "total", component: "total", variant: "hero", x: 0, y: 2, w: 24, h: 13 },
        { id: "cta", component: "callToAction", x: 0, y: 15, w: 24, h: 6 },
        { id: "infobar", component: "infoBar", x: 0, y: 21, w: 24, h: 3 },
      ],
      overlays: [{ component: "toasts" }],
    },
  },
  totalAndItems: {
    name: "Total and items",
    description: "The total over the featured items, full width.",
    blocks: {
      blocks: [
        { id: "header", component: "header", x: 0, y: 0, w: 24, h: 2 },
        { id: "total", component: "total", variant: "hero", x: 0, y: 2, w: 24, h: 6 },
        { id: "featured", component: "featuredItems", x: 0, y: 8, w: 24, h: 13 },
        { id: "infobar", component: "infoBar", x: 0, y: 21, w: 24, h: 3 },
      ],
      overlays: [{ component: "toasts" }],
    },
  },
};

export interface Template {
  id: string;
  name: string;
  description: string;
  blocks: BlockLayout;
}

export const templates: Template[] = Object.entries(templateInputs).map(([key, t]) => ({
  id: `${TEMPLATE_PREFIX}${key}`,
  name: t.name,
  description: t.description,
  blocks: complete(t.blocks),
}));

export function templateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
