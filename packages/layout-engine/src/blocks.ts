import { z } from "zod";
import { LayoutDefinitionSchema, type LayoutDefinition } from "./definition.js";

/*
 * Block layouts are what operators build: components placed as rectangles on
 * a fixed snap grid. `compileBlocks` turns one into an ordinary
 * LayoutDefinition (named grid areas), so the renderer is the same for
 * built-in and operator-built layouts.
 */

export const GRID_COLUMNS = 24;
export const GRID_ROWS = 24;
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Block ids become CSS grid area names. */
const blockId = z.string().regex(/^[a-zA-Z][\w-]{0,39}$/, "Block ids are letters, digits, - and _");
const settings = z.record(z.string(), z.unknown()).default({});

export const BlockSchema = z.object({
  id: blockId,
  component: z.string().min(1),
  /** One of the component's variants; its first when omitted. */
  variant: z.string().optional(),
  settings,
  x: z.number().int().min(0).max(GRID_COLUMNS - 1),
  y: z.number().int().min(0).max(GRID_ROWS - 1),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(GRID_ROWS),
});
export type Block = z.infer<typeof BlockSchema>;

export const BlockLayoutSchema = z.object({
  /** Space between grid cells, in design px. */
  gap: z.number().int().min(0).max(80).default(20),
  /** Space around the stage's edge, in design px. */
  padding: z.number().int().min(0).max(160).default(24),
  blocks: z.array(BlockSchema).max(48),
  /** Full-stage components drawn over the blocks (thank-you toasts), in order. */
  overlays: z.array(z.object({ component: z.string().min(1), settings })).max(8).default([]),
});
export type BlockLayout = z.infer<typeof BlockLayoutSchema>;
export type BlockLayoutInput = z.input<typeof BlockLayoutSchema>;

/** The size of one grid cell, in design px, for a layout's gap and padding. */
export function cellSize(layout: Pick<BlockLayout, "gap" | "padding">): { width: number; height: number } {
  const inner = (span: number, cells: number) => (span - 2 * layout.padding - (cells - 1) * layout.gap) / cells;
  return { width: inner(STAGE_WIDTH, GRID_COLUMNS), height: inner(STAGE_HEIGHT, GRID_ROWS) };
}

/** A block's rendered size in design px. */
export function blockSize(layout: Pick<BlockLayout, "gap" | "padding">, block: Pick<Block, "w" | "h">) {
  const cell = cellSize(layout);
  return {
    width: block.w * cell.width + (block.w - 1) * layout.gap,
    height: block.h * cell.height + (block.h - 1) * layout.gap,
  };
}

/**
 * Compiles a block layout to a LayoutDefinition. Blocks that leave the grid
 * or overlap are an error: validate with `validateBlocks` first.
 */
export function compileBlocks(input: BlockLayoutInput, meta: { id: string; name: string }): LayoutDefinition {
  const layout = BlockLayoutSchema.parse(input);
  const cells: string[][] = Array.from({ length: GRID_ROWS }, () => Array<string>(GRID_COLUMNS).fill("."));
  for (const block of layout.blocks) {
    for (let y = block.y; y < block.y + block.h; y++) {
      for (let x = block.x; x < block.x + block.w; x++) {
        if (y >= GRID_ROWS || x >= GRID_COLUMNS) throw new Error(`Block "${block.id}" leaves the grid`);
        if (cells[y]![x] !== ".") throw new Error(`Block "${block.id}" overlaps "${cells[y]![x]}"`);
        cells[y]![x] = block.id;
      }
    }
  }
  return LayoutDefinitionSchema.parse({
    id: meta.id,
    name: meta.name,
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    grid: {
      columns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
      rows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
      areas: cells.map((row) => row.join(" ")),
      gap: `${layout.gap}px`,
      padding: `${layout.padding}px`,
    },
    slots: Object.fromEntries(
      layout.blocks.map((b) => [b.id, { component: b.component, variant: b.variant, options: b.settings }]),
    ),
    overlays: layout.overlays.map((o) => ({ component: o.component, options: o.settings })),
  });
}

/**
 * What a layout can place, as plain data (no React), so servers, editors,
 * and renderers share it. Keyed by component name, like a Registry.
 */
export interface CatalogEntry {
  name: string;
  description: string;
  category: "money" | "items" | "show" | "brand" | "scene";
  /** Where it goes: a block on the grid, or a full-stage overlay. */
  placement: "block" | "overlay";
  /**
   * Each variant's sizes on the stage, in design px. The first is the default.
   * - `minWidth`/`minHeight`: the smallest readable size; smaller blocks are refused.
   * - `reference`: the block size the component's text is designed for. A
   *   bigger or smaller block scales its content to match (see `contentScale`),
   *   up to `maxScale`. Without one, content never scales.
   */
  variants: Record<string, VariantSize>;
  /** Whether a layout may place it more than once. */
  repeatable: boolean;
  /** Shows the fundraising total (layouts for most scenes should have one). */
  showsTotal?: boolean;
  /** Validates and fills defaults for a block's settings. */
  settings: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>;
}
export type Catalog = Record<string, CatalogEntry>;

export interface VariantSize {
  minWidth: number;
  minHeight: number;
  reference?: { width?: number; height?: number };
  maxScale?: number;
}

/** Content never shrinks below this, however small its block (minimum sizes keep it readable). */
export const MIN_CONTENT_SCALE = 0.6;
export const DEFAULT_MAX_SCALE = 2;

/**
 * How much a block's content should scale for the block's size: the smaller
 * of its width and height ratios to the variant's reference size, clamped,
 * and rounded so tiny size changes don't re-render.
 */
export function contentScale(size: VariantSize | undefined, block: { width: number; height: number }): number {
  const ref = size?.reference;
  if (!ref || block.width <= 0 || block.height <= 0) return 1;
  const ratios = [ref.width ? block.width / ref.width : null, ref.height ? block.height / ref.height : null].filter(
    (r): r is number => r !== null,
  );
  if (ratios.length === 0) return 1;
  const scale = Math.min(Math.max(Math.min(...ratios), MIN_CONTENT_SCALE), size.maxScale ?? DEFAULT_MAX_SCALE);
  return Math.round(scale * 100) / 100;
}

/** The fewest grid cells a block needs to reach `px` along one axis. */
export function cellsFor(layout: Pick<BlockLayout, "gap" | "padding">, axis: "width" | "height", px: number): number {
  const cell = cellSize(layout)[axis];
  const max = axis === "width" ? GRID_COLUMNS : GRID_ROWS;
  for (let n = 1; n <= max; n++) if (n * cell + (n - 1) * layout.gap >= px - 0.5) return n;
  return max;
}

export interface BlockProblems {
  /** Make the layout unusable: saving or publishing is refused. */
  errors: string[];
  /** Allowed, but worth a second look. */
  warnings: string[];
}

/**
 * Checks a block layout against a catalog. `expectTotal` asks for the
 * warning when nothing on the layout shows the total.
 */
export function validateBlocks(input: unknown, catalog: Catalog, options: { expectTotal?: boolean } = {}): BlockProblems {
  const parsed = BlockLayoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(layout)"}: ${issue.message}`),
      warnings: [],
    };
  }
  const layout = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = (b: Block) => catalog[b.component]?.name ?? b.component;

  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const block of layout.blocks) {
    if (ids.has(block.id)) errors.push(`Two blocks are called "${block.id}"`);
    ids.add(block.id);
    counts.set(block.component, (counts.get(block.component) ?? 0) + 1);

    if (block.x + block.w > GRID_COLUMNS || block.y + block.h > GRID_ROWS) {
      errors.push(`${label(block)} goes past the edge of the screen`);
    }
    const entry = catalog[block.component];
    if (!entry) {
      errors.push(`Unknown component "${block.component}"`);
      continue;
    }
    if (entry.placement !== "block") {
      errors.push(`${entry.name} can't be placed as a block`);
      continue;
    }
    const variantNames = Object.keys(entry.variants);
    const variant = block.variant ?? variantNames[0]!;
    const min = entry.variants[variant];
    if (!min) {
      errors.push(`${entry.name} has no "${variant}" size (has ${variantNames.join(", ")})`);
    } else {
      const size = blockSize(layout, block);
      if (size.width < min.minWidth - 0.5 || size.height < min.minHeight - 0.5) {
        errors.push(
          `${entry.name} is too small to read: ${Math.round(size.width)}x${Math.round(size.height)}px, needs at least ${min.minWidth}x${min.minHeight}px`,
        );
      }
    }
    const result = entry.settings.safeParse(block.settings);
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${entry.name}: ${issue.path.join(".") || "settings"}: ${issue.message}`);
    }
  }
  for (const [component, count] of counts) {
    const entry = catalog[component];
    if (entry && !entry.repeatable && count > 1) errors.push(`${entry.name} can only appear once`);
  }

  for (const [a, first] of layout.blocks.entries()) {
    for (const second of layout.blocks.slice(a + 1)) {
      const apart =
        first.x + first.w <= second.x ||
        second.x + second.w <= first.x ||
        first.y + first.h <= second.y ||
        second.y + second.h <= first.y;
      if (!apart) errors.push(`${label(first)} overlaps ${label(second)}`);
    }
  }

  for (const overlay of layout.overlays) {
    const entry = catalog[overlay.component];
    if (!entry) errors.push(`Unknown overlay "${overlay.component}"`);
    else if (entry.placement !== "overlay") errors.push(`${entry.name} can't be an overlay`);
    else if (!entry.settings.safeParse(overlay.settings).success) errors.push(`${entry.name}: invalid settings`);
  }

  if (options.expectTotal && !layout.blocks.some((b) => catalog[b.component]?.showsTotal)) {
    warnings.push("Nothing on this layout shows the total.");
  }
  if (layout.blocks.length === 0) warnings.push("This layout is empty.");
  return { errors, warnings };
}

/** Fills each block's and overlay's settings with the catalog's defaults. */
export function normalizeBlocks(layout: BlockLayout, catalog: Catalog): BlockLayout {
  const fill = (component: string, value: Record<string, unknown>) => {
    const parsed = catalog[component]?.settings.safeParse(value);
    return parsed?.success ? parsed.data : value;
  };
  return {
    ...layout,
    blocks: layout.blocks.map((b) => ({ ...b, settings: fill(b.component, b.settings) })),
    overlays: layout.overlays.map((o) => ({ ...o, settings: fill(o.component, o.settings) })),
  };
}
