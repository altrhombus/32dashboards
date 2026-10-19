import { describe, expect, it } from "vitest";
import type { BlockLayout } from "@32dashboards/layout-engine/data";
import type { Screen } from "@32dashboards/schema/core";
import { builtInLayouts } from "../src/layouts.js";
import * as library from "../src/library.js";

let n = 0;
const deps: library.Deps = {
  now: () => "2026-10-19T12:00:00.000Z",
  newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
};

const copyOfMain = () => library.copyLayout([], { fromId: "builtin:main" }, deps);
const screen = (layouts: Screen["layouts"]): Screen => ({ id: "left", name: "Main room left", layouts });

describe("copyLayout", () => {
  it("copies a built-in layout, filling setting defaults", () => {
    const { layouts, layoutId } = copyOfMain();
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ id: layoutId, name: "Copy of Main", view: "main", draft: null });
    const featured = layouts[0]!.published.blocks.find((b) => b.component === "featuredItems");
    expect(featured?.settings).toEqual({ title: "Featured items", size: 6 });
  });

  it("copies a saved layout under a given name", () => {
    const first = copyOfMain();
    const second = library.copyLayout(first.layouts, { fromId: first.layoutId, name: "Lobby" }, deps);
    expect(second.layouts.map((l) => l.name)).toEqual(["Copy of Main", "Lobby"]);
  });

  it("refuses an unknown source", () => {
    expect(() => library.copyLayout([], { fromId: "builtin:nope" }, deps)).toThrow(library.LayoutError);
  });
});

describe("drafts", () => {
  const smaller = (layout: BlockLayout): BlockLayout => ({
    ...layout,
    blocks: layout.blocks.filter((b) => b.component !== "sponsors"),
  });

  it("saves a draft without changing what screens show, then publishes it", () => {
    const { layouts, layoutId } = copyOfMain();
    const draft = smaller(layouts[0]!.published);
    const saved = library.saveLayoutDraft(layouts, layoutId, draft, deps);
    expect(saved.warnings).toEqual([]);
    expect(saved.layouts[0]!.published.blocks).toHaveLength(7);
    expect(saved.layouts[0]!.draft?.blocks).toHaveLength(6);

    const published = library.publishLayout(saved.layouts, layoutId, deps);
    expect(published.layouts[0]!.published.blocks).toHaveLength(6);
    expect(published.layouts[0]!.draft).toBeNull();
    expect(() => library.publishLayout(published.layouts, layoutId, deps)).toThrow(/no changes/);
  });

  it("refuses a draft with errors and returns warnings for one without", () => {
    const { layouts, layoutId } = copyOfMain();
    const base = layouts[0]!.published;
    const tooSmall = { ...base, blocks: base.blocks.map((b) => (b.component === "total" ? { ...b, w: 4, h: 2 } : b)) };
    expect(() => library.saveLayoutDraft(layouts, layoutId, tooSmall, deps)).toThrow(/Total raised is too small/);

    const noTotal = { ...base, blocks: base.blocks.filter((b) => b.component !== "total") };
    expect(library.saveLayoutDraft(layouts, layoutId, noTotal, deps).warnings).toEqual([
      "Nothing on this layout shows the total.",
    ]);
  });

  it("discards a draft", () => {
    const { layouts, layoutId } = copyOfMain();
    const saved = library.saveLayoutDraft(layouts, layoutId, smaller(layouts[0]!.published), deps);
    expect(library.discardLayoutDraft(saved.layouts, layoutId, deps)[0]!.draft).toBeNull();
  });
});

describe("deleteLayout", () => {
  it("refuses while a screen uses it, naming the screen", () => {
    const { layouts, layoutId } = copyOfMain();
    expect(() => library.deleteLayout(layouts, layoutId, [screen({ main: layoutId })])).toThrow(/Main room left/);
    expect(library.deleteLayout(layouts, layoutId, [screen({})])).toEqual([]);
  });
});

describe("resolveLayout", () => {
  it("shows the built-in layout when the screen chose nothing or isn't set up", () => {
    expect(library.resolveLayout("main", undefined, [])).toEqual({ layout: builtInLayouts.main.layout, problem: null });
    expect(library.resolveLayout("askMe", screen({ main: "builtin:main" }), []).layout).toBe(builtInLayouts.askMe.layout);
  });

  it("shows a chosen built-in, even one made for another scene", () => {
    expect(library.resolveLayout("intermission", screen({ intermission: "builtin:main" }), []).layout).toBe(
      builtInLayouts.main.layout,
    );
  });

  it("shows a saved layout's published version", () => {
    const { layouts, layoutId } = copyOfMain();
    const renamed = library.renameLayout(layouts, layoutId, "Left TV", deps);
    const resolved = library.resolveLayout("main", screen({ main: layoutId }), renamed);
    expect(resolved.problem).toBeNull();
    expect(resolved.layout).toMatchObject({ id: layoutId, name: "Left TV" });
  });

  it("falls back to the built-in layout, with the reason, when the chosen one is missing or broken", () => {
    const missing = library.resolveLayout("main", screen({ main: deps.newId() }), []);
    expect(missing.layout).toBe(builtInLayouts.main.layout);
    expect(missing.problem).toMatch(/no longer exists/);

    const { layouts, layoutId } = copyOfMain();
    const broken = layouts.map((l) => ({ ...l, published: { ...l.published, blocks: [...l.published.blocks, l.published.blocks[0]!] } }));
    const resolved = library.resolveLayout("main", screen({ main: layoutId }), broken);
    expect(resolved.layout).toBe(builtInLayouts.main.layout);
    expect(resolved.problem).toMatch(/can't be shown/);
  });
});
