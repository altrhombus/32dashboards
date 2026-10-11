import { describe, expect, it } from "vitest";
import { createFakeNodecg } from "@32dashboards/nodecg-testing";
import { createFakeCore, testEvent } from "@32dashboards/source-sdk/testing";
import sourceManual from "../src/extension/index.js";
import type { EntriesReplicant } from "../src/model.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setup() {
  const fake = createFakeNodecg("source-manual");
  const core = createFakeCore([testEvent(A, "manual"), testEvent(B, "32auctions")]);
  sourceManual(fake.api, core);
  const entries = () => fake.replicant<EntriesReplicant>("entries").value;
  return { fake, core, entries };
}

describe("source-manual", () => {
  it("reports each edit to the core as a new observation", async () => {
    const { fake, core, entries } = setup();
    await fake.send("setTotal", { eventId: A, total: 100 });
    await fake.send("addDonation", { eventId: A, amount: 25.5 });

    expect(core.reports.map((r) => [r.sourceId, r.eventId, r.total])).toEqual([
      ["manual", A, 100],
      ["manual", A, 125.5],
    ]);
    expect(entries()[A]?.total).toBe(125.5);
  });

  it("adds, edits, and removes items", async () => {
    const { fake, entries } = setup();
    const id = (await fake.send("upsertItem", { eventId: A, item: { title: "Quilt", currentBid: 40 } })) as string;
    await fake.send("upsertItem", { eventId: A, item: { id, title: "Quilt", currentBid: 55, bidCount: 3 } });
    expect(entries()[A]?.items).toEqual([
      { id, title: "Quilt", currentBid: 55, bidCount: 3, value: null, imageUrl: null, remaining: null },
    ]);
    await fake.send("removeItem", { eventId: A, itemId: id });
    expect(entries()[A]?.items).toEqual([]);
  });

  it("refuses edits the core won't store, and saves nothing", async () => {
    const { fake, core, entries } = setup();
    core.nextOutcome = "wrong-source";
    await expect(fake.send("setTotal", { eventId: B, total: 5 })).rejects.toThrow(/Manual entry/);
    expect(entries()).toEqual({});
  });

  it("validates input", async () => {
    const { fake } = setup();
    await expect(fake.send("addDonation", { eventId: A, amount: -5 })).rejects.toThrow(/amount/);
    await expect(fake.send("upsertItem", { eventId: A, item: { title: " " } })).rejects.toThrow(/title/);
    await expect(fake.send("upsertItem", { eventId: A, item: { id: "gone", title: "X" } })).rejects.toThrow(
      /no longer exists/,
    );
  });

  it("drops entries for deleted events", async () => {
    const { fake, core, entries } = setup();
    await fake.send("setTotal", { eventId: A, total: 10 });
    core.setEvents(core.listEvents().filter((e) => e.id !== A));
    expect(entries()).toEqual({});
  });

  it("re-sends the stored entry on refresh", async () => {
    const { fake, core } = setup();
    await fake.send("setTotal", { eventId: A, total: 10 });
    core.requestRefresh("manual", A);
    expect(core.reports).toHaveLength(2);
  });
});
