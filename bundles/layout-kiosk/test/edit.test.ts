import { describe, expect, it } from "vitest";
import { BlockLayoutSchema, type BlockLayout } from "@32dashboards/layout-engine/data";
import * as edit from "../src/builder/edit.js";
import { kioskCatalog } from "../src/catalog.js";
import { builtInLayouts } from "../src/layouts.js";
import { checkLayout } from "../src/library.js";

const empty = (): BlockLayout => BlockLayoutSchema.parse({ blocks: [] });
const main = () => builtInLayouts.main.blocks;

describe("addBlock", () => {
  it("adds a component at its reference size, with default settings, in the first free spot", () => {
    const result = edit.addBlock(empty(), kioskCatalog, "countdown");
    if ("error" in result) throw new Error(result.error);
    const block = result.layout.blocks[0]!;
    expect(block).toMatchObject({ id: "countdown", component: "countdown", x: 0, y: 0, settings: { title: "Time left" } });
    expect(edit.blockPixels(result.layout, block).width).toBeGreaterThanOrEqual(532);
    expect(checkLayout(result.layout, "askMe").errors).toEqual([]);
  });

  it("gives repeats a fresh id, and refuses components that can't repeat", () => {
    let layout = empty();
    for (let i = 0; i < 2; i++) {
      const result = edit.addBlock(layout, kioskCatalog, "sponsors");
      if ("error" in result) throw new Error(result.error);
      layout = result.layout;
    }
    expect(layout.blocks.map((b) => b.id)).toEqual(["sponsors", "sponsors2"]);
    expect(edit.addBlock(main(), kioskCatalog, "total")).toEqual({ error: "Total raised is already on this layout." });
  });

  it("falls back to the smallest readable size, then says when there's no room", () => {
    expect(edit.addBlock(main(), kioskCatalog, "callToAction")).toEqual({
      error: "There's no room for Call to action. Make some space first.",
    });
    const withoutSponsors = edit.removeBlock(main(), "sponsors");
    const result = edit.addBlock(withoutSponsors, kioskCatalog, "countdown");
    expect("error" in result).toBe(true);
  });

  it("refuses overlays and unknown components as blocks", () => {
    expect(edit.addBlock(empty(), kioskCatalog, "toasts")).toHaveProperty("error");
    expect(edit.addBlock(empty(), kioskCatalog, "nope")).toHaveProperty("error");
  });
});

describe("applyGrid", () => {
  it("applies moves and keeps the same object when nothing changed", () => {
    const layout = main();
    expect(edit.applyGrid(layout, layout.blocks.map((b) => ({ i: b.id, x: b.x, y: b.y, w: b.w, h: b.h })))).toBe(layout);
    const moved = edit.applyGrid(layout, [{ i: "countdown", x: 17, y: 8, w: 7, h: 3 }]);
    expect(moved.blocks.find((b) => b.id === "countdown")?.h).toBe(3);
  });
});

describe("nudgeBlock", () => {
  it("moves and resizes by cells when it stays clear, readable and on screen", () => {
    const layout = edit.removeBlock(main(), "sponsors");
    const grown = edit.nudgeBlock(layout, kioskCatalog, "announcements", { dh: 2 });
    expect(grown.blocks.find((b) => b.id === "announcements")?.h).toBe(6);
    expect(edit.nudgeBlock(layout, kioskCatalog, "announcements", { dy: -1 })).toBe(layout);
    expect(edit.nudgeBlock(layout, kioskCatalog, "infobar", { dy: 1 })).toBe(layout);
    expect(edit.nudgeBlock(layout, kioskCatalog, "countdown", { dh: -3 })).toBe(layout);
  });
});

describe("setOverlay", () => {
  it("turns an overlay on and off", () => {
    const off = edit.setOverlay(main(), "toasts", false);
    expect(off.overlays).toEqual([]);
    expect(edit.setOverlay(off, "toasts", true).overlays).toEqual([{ component: "toasts", settings: {} }]);
    expect(edit.setOverlay(off, "toasts", false)).toBe(off);
  });
});

describe("settingFields", () => {
  it("reads text and number fields with their limits and defaults", () => {
    expect(edit.settingFields(kioskCatalog.featuredItems!.settings)).toEqual([
      { key: "title", kind: "text", maxLength: 60, fallback: "Featured items" },
      { key: "size", kind: "number", min: 1, max: 12, fallback: 6 },
    ]);
    expect(edit.settingFields(kioskCatalog.header!.settings)).toEqual([]);
  });
});
