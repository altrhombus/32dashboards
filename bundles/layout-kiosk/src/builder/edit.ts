import { z } from "zod";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  blockSize,
  cellsFor,
  type Block,
  type BlockLayout,
  type Catalog,
} from "@32dashboards/layout-engine/data";

/*
 * The layout builder's edits as pure functions over block layouts, so they
 * can be tested without a browser. The builder screen (builder.tsx) only
 * wires these to the canvas, palette and inspector.
 */

/** The fewest cells a block may shrink to, from its size's readable minimum. */
export function minCells(layout: BlockLayout, catalog: Catalog, block: Pick<Block, "component" | "variant">) {
  const entry = catalog[block.component];
  const variant = block.variant ?? Object.keys(entry?.variants ?? {})[0];
  const min = variant ? entry?.variants[variant] : undefined;
  if (!min) return { w: 1, h: 1 };
  return { w: cellsFor(layout, "width", min.minWidth), h: cellsFor(layout, "height", min.minHeight) };
}

/** A block's starting size: its reference size if it has one, never under its minimum. */
export function startingCells(layout: BlockLayout, catalog: Catalog, component: string) {
  const entry = catalog[component];
  const variant = Object.values(entry?.variants ?? {})[0];
  const min = minCells(layout, catalog, { component });
  const ref = variant?.reference;
  return {
    w: Math.max(min.w, ref?.width ? cellsFor(layout, "width", ref.width) : min.w),
    h: Math.max(min.h, ref?.height ? cellsFor(layout, "height", ref.height) : min.h),
  };
}

function overlaps(a: Pick<Block, "x" | "y" | "w" | "h">, b: Pick<Block, "x" | "y" | "w" | "h">) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** The first free spot (top to bottom, left to right) for a w x h block, or null. */
export function findSpace(layout: BlockLayout, w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= GRID_ROWS; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      if (!layout.blocks.some((b) => overlaps(b, { x, y, w, h }))) return { x, y };
    }
  }
  return null;
}

/** A block id not used yet, based on the component's name. */
export function newBlockId(layout: BlockLayout, component: string): string {
  const base = component.replace(/[^\w-]/g, "").replace(/^[^a-zA-Z]+/, "") || "block";
  const used = new Set(layout.blocks.map((b) => b.id));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

export type AddResult = { layout: BlockLayout; blockId: string } | { error: string };

/**
 * Adds a component where it fits: at its starting size if there's room,
 * else at its smallest readable size.
 */
export function addBlock(layout: BlockLayout, catalog: Catalog, component: string): AddResult {
  const entry = catalog[component];
  if (!entry || entry.placement !== "block") return { error: `${component} can't be placed as a block.` };
  if (!entry.repeatable && layout.blocks.some((b) => b.component === component)) {
    return { error: `${entry.name} is already on this layout.` };
  }
  for (const size of [startingCells(layout, catalog, component), minCells(layout, catalog, { component })]) {
    const spot = findSpace(layout, size.w, size.h);
    if (spot) {
      const id = newBlockId(layout, component);
      const defaults = entry.settings.safeParse({});
      const block: Block = { id, component, settings: defaults.success ? defaults.data : {}, ...spot, ...size };
      return { layout: { ...layout, blocks: [...layout.blocks, block] }, blockId: id };
    }
  }
  return { error: `There's no room for ${entry.name}. Make some space first.` };
}

/** Applies positions and sizes from the canvas (`i` is the block id). */
export function applyGrid(
  layout: BlockLayout,
  items: readonly { i: string; x: number; y: number; w: number; h: number }[],
): BlockLayout {
  const byId = new Map(items.map((item) => [item.i, item]));
  let changed = false;
  const blocks = layout.blocks.map((b) => {
    const item = byId.get(b.id);
    if (!item || (item.x === b.x && item.y === b.y && item.w === b.w && item.h === b.h)) return b;
    changed = true;
    return { ...b, x: item.x, y: item.y, w: item.w, h: item.h };
  });
  return changed ? { ...layout, blocks } : layout;
}

export function updateBlock(layout: BlockLayout, id: string, patch: Partial<Omit<Block, "id">>): BlockLayout {
  return { ...layout, blocks: layout.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

export function removeBlock(layout: BlockLayout, id: string): BlockLayout {
  return { ...layout, blocks: layout.blocks.filter((b) => b.id !== id) };
}

/** Moves or resizes a block by whole cells, if it stays on screen, readable, and clear of others. */
export function nudgeBlock(
  layout: BlockLayout,
  catalog: Catalog,
  id: string,
  change: { dx?: number; dy?: number; dw?: number; dh?: number },
): BlockLayout {
  const block = layout.blocks.find((b) => b.id === id);
  if (!block) return layout;
  const next = {
    ...block,
    x: block.x + (change.dx ?? 0),
    y: block.y + (change.dy ?? 0),
    w: block.w + (change.dw ?? 0),
    h: block.h + (change.dh ?? 0),
  };
  const min = minCells(layout, catalog, block);
  const fits =
    next.x >= 0 &&
    next.y >= 0 &&
    next.x + next.w <= GRID_COLUMNS &&
    next.y + next.h <= GRID_ROWS &&
    next.w >= min.w &&
    next.h >= min.h &&
    !layout.blocks.some((b) => b.id !== id && overlaps(b, next));
  return fits ? updateBlock(layout, id, next) : layout;
}

/** Turns an overlay on or off (e.g. thank-you pop-ups). */
export function setOverlay(layout: BlockLayout, component: string, on: boolean): BlockLayout {
  const has = layout.overlays.some((o) => o.component === component);
  if (on === has) return layout;
  return {
    ...layout,
    overlays: on ? [...layout.overlays, { component, settings: {} }] : layout.overlays.filter((o) => o.component !== component),
  };
}

/** A block's size on the stage, rounded, for people. */
export function blockPixels(layout: BlockLayout, block: Pick<Block, "w" | "h">) {
  const size = blockSize(layout, block);
  return { width: Math.round(size.width), height: Math.round(size.height) };
}

/** One settings field the inspector can show, read from a catalog entry's settings schema. */
export type SettingField =
  | { key: string; kind: "text"; maxLength?: number; fallback: string }
  | { key: string; kind: "number"; min?: number; max?: number; fallback: number }
  | { key: string; kind: "toggle"; fallback: boolean };

/** Reads simple fields (text, whole numbers, on/off) from a settings schema; anything else is skipped. */
export function settingFields(schema: z.ZodTypeAny): SettingField[] {
  if (!(schema instanceof z.ZodObject)) return [];
  const fields: SettingField[] = [];
  for (const [key, raw] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
    let inner = raw;
    let fallback: unknown;
    while (inner instanceof z.ZodDefault || inner instanceof z.ZodOptional) {
      if (inner instanceof z.ZodDefault) fallback = inner._def.defaultValue();
      inner = inner instanceof z.ZodDefault ? inner._def.innerType : inner.unwrap();
    }
    if (inner instanceof z.ZodString) {
      fields.push({ key, kind: "text", maxLength: inner.maxLength ?? undefined, fallback: String(fallback ?? "") });
    } else if (inner instanceof z.ZodNumber) {
      fields.push({ key, kind: "number", min: inner.minValue ?? undefined, max: inner.maxValue ?? undefined, fallback: Number(fallback ?? 0) });
    } else if (inner instanceof z.ZodBoolean) {
      fields.push({ key, kind: "toggle", fallback: Boolean(fallback) });
    }
  }
  return fields;
}

/** Human names for settings keys. */
export const SETTING_LABELS: Record<string, string> = { title: "Heading (empty hides it)", size: "How many to show" };
