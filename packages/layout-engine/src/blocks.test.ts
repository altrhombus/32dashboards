import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GRID_COLUMNS,
  blockSize,
  cellSize,
  cellsFor,
  contentScale,
  compileBlocks,
  normalizeBlocks,
  validateBlocks,
  type BlockLayout,
  type Catalog,
} from "./blocks.js";
import { validateLayout } from "./registry.js";

const catalog: Catalog = {
  total: {
    name: "Total",
    description: "The total",
    category: "money",
    placement: "block",
    variants: { hero: { minWidth: 800, minHeight: 200 }, compact: { minWidth: 200, minHeight: 80 } },
    repeatable: false,
    showsTotal: true,
    settings: z.object({}).strict(),
  },
  card: {
    name: "Card",
    description: "A titled card",
    category: "show",
    placement: "block",
    variants: { default: { minWidth: 100, minHeight: 50 } },
    repeatable: true,
    settings: z.object({ title: z.string().max(20).default("Hello") }).strict(),
  },
  toasts: {
    name: "Thank-you pop-ups",
    description: "Toasts",
    category: "show",
    placement: "overlay",
    variants: { stack: { minWidth: 0, minHeight: 0 } },
    repeatable: false,
    settings: z.object({}).strict(),
  },
};

const layout = (blocks: BlockLayout["blocks"], extra: Partial<BlockLayout> = {}): BlockLayout => ({
  gap: 20,
  padding: 24,
  blocks,
  overlays: [],
  ...extra,
});

describe("cellSize and blockSize", () => {
  it("fill the stage exactly", () => {
    const l = layout([]);
    const full = blockSize(l, { w: GRID_COLUMNS, h: 24 });
    expect(full.width).toBeCloseTo(1920 - 48);
    expect(full.height).toBeCloseTo(1080 - 48);
    expect(cellSize({ gap: 0, padding: 0 })).toEqual({ width: 80, height: 45 });
  });
});

describe("compileBlocks", () => {
  it("maps blocks to named grid areas and keeps settings as slot options", () => {
    const def = compileBlocks(
      layout(
        [
          { id: "top", component: "total", variant: "hero", settings: {}, x: 0, y: 0, w: 24, h: 6 },
          { id: "left", component: "card", settings: { title: "Hi" }, x: 0, y: 6, w: 12, h: 18 },
        ],
        { overlays: [{ component: "toasts", settings: {} }] },
      ),
      { id: "l1", name: "One" },
    );
    expect(def.grid.areas).toHaveLength(24);
    expect(def.grid.areas[0]!.split(" ")).toEqual(Array(24).fill("top"));
    expect(def.grid.areas[6]!.split(" ")).toEqual([...Array(12).fill("left"), ...Array(12).fill(".")]);
    expect(def.slots.left).toEqual({ component: "card", options: { title: "Hi" } });
    expect(def.overlays).toEqual([{ component: "toasts", options: {} }]);
    expect(def.grid.gap).toBe("20px");
  });

  it("produces a layout the renderer's checks accept", () => {
    const def = compileBlocks(layout([{ id: "a", component: "card", settings: {}, x: 2, y: 2, w: 4, h: 4 }]), {
      id: "l",
      name: "L",
    });
    const registry = { card: { variants: ["default"], select: () => ({}), component: () => null } };
    expect(validateLayout(def, registry)).toEqual([]);
  });

  it("refuses overlapping blocks", () => {
    expect(() =>
      compileBlocks(
        layout([
          { id: "a", component: "card", settings: {}, x: 0, y: 0, w: 4, h: 4 },
          { id: "b", component: "card", settings: {}, x: 3, y: 3, w: 4, h: 4 },
        ]),
        { id: "l", name: "L" },
      ),
    ).toThrow(/overlaps/);
  });
});

describe("validateBlocks", () => {
  const total = { id: "t", component: "total", variant: "hero", settings: {}, x: 0, y: 0, w: 24, h: 6 };

  it("accepts a sound layout", () => {
    expect(validateBlocks(layout([total]), catalog, { expectTotal: true })).toEqual({ errors: [], warnings: [] });
  });

  it("reports overlaps, edges, unknown components and sizes, and duplicate ids", () => {
    const { errors } = validateBlocks(
      layout([
        total,
        { id: "t", component: "card", settings: {}, x: 20, y: 3, w: 6, h: 2 },
        { id: "x", component: "nope", settings: {}, x: 0, y: 10, w: 1, h: 1 },
        { id: "y", component: "card", variant: "huge", settings: {}, x: 0, y: 12, w: 2, h: 2 },
      ]),
      catalog,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Two blocks are called "t"',
        "Card goes past the edge of the screen",
        'Unknown component "nope"',
        'Card has no "huge" size (has default)',
        "Total overlaps Card",
      ]),
    );
  });

  it("refuses blocks smaller than their size's readable minimum", () => {
    const { errors } = validateBlocks(layout([{ ...total, w: 8, h: 2 }]), catalog);
    expect(errors[0]).toMatch(/^Total is too small to read: \d+x\d+px, needs at least 800x200px$/);
  });

  it("checks settings, repeats, and placement", () => {
    const { errors } = validateBlocks(
      layout(
        [
          total,
          { ...total, id: "t2", y: 6 },
          { id: "c", component: "card", settings: { title: "x".repeat(30) }, x: 0, y: 12, w: 4, h: 4 },
          { id: "o", component: "toasts", settings: {}, x: 6, y: 12, w: 4, h: 4 },
        ],
        { overlays: [{ component: "card", settings: {} }] },
      ),
      catalog,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "Total can only appear once",
        expect.stringMatching(/^Card: title: /),
        "Thank-you pop-ups can't be placed as a block",
        "Card can't be an overlay",
      ]),
    );
  });

  it("warns, without refusing, when nothing shows the total", () => {
    const result = validateBlocks(
      layout([{ id: "c", component: "card", settings: {}, x: 0, y: 0, w: 4, h: 4 }]),
      catalog,
      { expectTotal: true },
    );
    expect(result).toEqual({ errors: [], warnings: ["Nothing on this layout shows the total."] });
  });

  it("reports schema problems readably", () => {
    expect(validateBlocks({ blocks: [{ id: "1bad" }] }, catalog).errors.length).toBeGreaterThan(0);
  });
});

describe("normalizeBlocks", () => {
  it("fills settings defaults", () => {
    const l = normalizeBlocks(layout([{ id: "c", component: "card", settings: {}, x: 0, y: 0, w: 4, h: 4 }]), catalog);
    expect(l.blocks[0]!.settings).toEqual({ title: "Hello" });
  });
});

describe("contentScale", () => {
  const size = { minWidth: 100, minHeight: 50, reference: { width: 400, height: 200 }, maxScale: 2 };

  it("scales by the tighter of width and height", () => {
    expect(contentScale(size, { width: 800, height: 300 })).toBe(1.5);
    expect(contentScale(size, { width: 400, height: 200 })).toBe(1);
  });

  it("clamps between the floor and the variant's cap", () => {
    expect(contentScale(size, { width: 4000, height: 2000 })).toBe(2);
    expect(contentScale(size, { width: 40, height: 20 })).toBe(0.6);
  });

  it("uses one axis when only one is given, and leaves content alone without a reference", () => {
    expect(contentScale({ ...size, reference: { height: 100 } }, { width: 10, height: 150 })).toBe(1.5);
    expect(contentScale({ minWidth: 0, minHeight: 0 }, { width: 999, height: 999 })).toBe(1);
    expect(contentScale(undefined, { width: 1, height: 1 })).toBe(1);
  });
});

describe("cellsFor", () => {
  it("finds the fewest cells reaching a size", () => {
    const l = { gap: 0, padding: 0 };
    expect(cellsFor(l, "width", 80)).toBe(1);
    expect(cellsFor(l, "width", 81)).toBe(2);
    expect(cellsFor(l, "height", 1080)).toBe(24);
    expect(cellsFor(l, "height", 5000)).toBe(24);
  });
});
