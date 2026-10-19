import { describe, expect, it } from "vitest";
import { createFakeNodecg, createFakeWorld } from "@32dashboards/nodecg-testing";
import layoutKiosk from "../src/extension/index.js";
import type { LayoutsReplicant } from "../src/library.js";

function setup() {
  const world = createFakeWorld();
  const core = createFakeNodecg("fundraiser-core", world);
  const screens = core.api.Replicant("screens", { defaultValue: [] as unknown[] });
  const fake = createFakeNodecg("layout-kiosk", world);
  layoutKiosk(fake.api);
  return { fake, screens, layouts: () => fake.replicant<LayoutsReplicant>("layouts").value };
}

describe("layout-kiosk extension", () => {
  it("copies, renames, drafts, publishes, and deletes layouts", async () => {
    const { fake, layouts } = setup();
    const id = (await fake.send("copyLayout", { fromId: "builtin:intermission" })) as string;
    await fake.send("renameLayout", { layoutId: id, name: "Dinner" });
    const draft = { ...layouts()[0]!.published, blocks: layouts()[0]!.published.blocks.slice(1) };
    expect(await fake.send("saveLayoutDraft", { layoutId: id, draft })).toEqual({ warnings: [] });
    expect(await fake.send("publishLayout", { layoutId: id })).toEqual({ warnings: [] });
    expect(layouts()[0]).toMatchObject({ name: "Dinner", draft: null });
    expect(layouts()[0]!.published.blocks).toHaveLength(3);
    await fake.send("deleteLayout", { layoutId: id });
    expect(layouts()).toEqual([]);
  });

  it("rejects bad requests with readable errors", async () => {
    const { fake, screens } = setup();
    await expect(fake.send("copyLayout", { fromId: "builtin:nope" })).rejects.toThrow(/No saved layout/);
    await expect(fake.send("renameLayout", { layoutId: "x", name: "y" })).rejects.toThrow(/layoutId/);

    const id = (await fake.send("copyLayout", { fromId: "builtin:main" })) as string;
    screens.value = [{ id: "left", name: "Left TV", layouts: { main: id } }];
    await expect(fake.send("deleteLayout", { layoutId: id })).rejects.toThrow(/in use on Left TV/);
  });
});
