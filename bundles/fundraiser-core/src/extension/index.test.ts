import { describe, expect, it } from "vitest";
import type { FundraiserEvent, LiveStateReplicant, RegisteredSourcesReplicant } from "@32dashboards/schema/core";
import { createFakeNodecg } from "@32dashboards/nodecg-testing";
import fundraiserCore from "./index.js";

function setup() {
  const fake = createFakeNodecg();
  const api = fundraiserCore(fake.api);
  const live = () => fake.replicant<LiveStateReplicant>("liveState").value;
  return { fake, api, live };
}

async function createActiveEvent(fake: ReturnType<typeof createFakeNodecg>, adapterId = "fake") {
  const eventId = (await fake.send("createEvent", { name: "Spring Gala" })) as string;
  await fake.send("updateEvent", { eventId, patch: { source: { adapterId } } });
  await fake.send("activateEvent", { eventId });
  return eventId;
}

describe("fundraiser-core extension", () => {
  it("starts with empty state and an empty liveState", () => {
    const { fake, live } = setup();
    expect(fake.replicant("events").value).toEqual([]);
    expect(fake.replicant("activeEventId").value).toBeNull();
    expect(live()).toMatchObject({ event: null, total: 0 });
  });

  it("acks validation errors with a readable message and leaves state alone", async () => {
    const { fake } = setup();
    await expect(fake.send("createEvent", { name: "" })).rejects.toThrow(/name/);
    await expect(fake.send("setAdjustment", { eventId: "nope", amount: 5 })).rejects.toThrow(/eventId/);
    expect(fake.replicant("events").value).toEqual([]);
  });

  it("applies the adjustment to the total displays read", async () => {
    const { fake, api, live } = setup();
    const eventId = await createActiveEvent(fake);
    const source = api.registerSource("fake", { label: "Fake" });

    expect(source.report({ eventId, total: 1000, observedAt: new Date().toISOString() })).toBe("stored");
    await fake.send("nudgeAdjustment", { eventId, delta: 100 });
    await fake.send("nudgeAdjustment", { eventId, delta: 50 });

    expect(live()).toMatchObject({ rawTotal: 1000, adjustment: 150, total: 1150, sourceId: "fake" });
  });

  it("keeps a late result on the event it was fetched for", async () => {
    const { fake, api, live } = setup();
    const first = await createActiveEvent(fake);
    const source = api.registerSource("fake", { label: "Fake" });
    const observedAt = new Date().toISOString();

    const second = (await fake.send("createEvent", { name: "Fall Gala" })) as string;
    await fake.send("activateEvent", { eventId: second });
    source.report({ eventId: first, total: 999, observedAt });

    expect(live()).toMatchObject({ total: 0, event: { id: second } });
    expect(fake.replicant<Record<string, { total: number }>>("sourceResults").value[first]?.total).toBe(999);
  });

  it("rejects invalid reports without throwing", () => {
    const { api } = setup();
    expect(api.registerSource("fake", { label: "Fake" }).report({ eventId: "nope", total: -1, observedAt: "later" })).toBe("invalid");
  });

  it("lists registered sources and refuses duplicates", () => {
    const { fake, api } = setup();
    api.registerSource("fake", { label: "Fake" });
    expect(fake.replicant<RegisteredSourcesReplicant>("sources").value.map((s) => s.id)).toEqual(["fake"]);
    expect(() => api.registerSource("fake", { label: "Fake" })).toThrow(/already registered/);
  });

  it("tells adapters when the active event changes", async () => {
    const { fake, api } = setup();
    const seen: (string | null)[] = [];
    const unsubscribe = api.onActiveEventChange((id) => seen.push(id));

    const eventId = await createActiveEvent(fake);
    await fake.send("activateEvent", { eventId });
    await fake.send("activateEvent", { eventId: null });
    unsubscribe();
    await fake.send("activateEvent", { eventId });

    expect(seen).toEqual([eventId, null]);
  });

  it("recomputes liveState when a Replicant is edited directly", async () => {
    const { fake, live } = setup();
    const eventId = await createActiveEvent(fake);
    const events = fake.replicant<FundraiserEvent[]>("events");
    events.value = events.value.map((e) => ({ ...e, adjustment: 42 }));
    expect(live().total).toBe(42);
  });

  it("refuses to delete the active event", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);
    await expect(fake.send("deleteEvent", { eventId })).rejects.toThrow(/on screen/);
  });

  it("sends donation moments for the active event, but not for a baseline", async () => {
    const { fake, api } = setup();
    const eventId = await createActiveEvent(fake);
    const source = api.registerSource("fake", { label: "Fake" });
    const item = { id: "a", title: "Guitar", currentBid: 50, bidCount: 1 };

    source.report({ eventId, total: 100, items: [item], observedAt: "2026-10-10T12:00:00.000Z" });
    expect(fake.world.sent).toEqual([]);

    source.report({
      eventId,
      total: 175,
      items: [{ ...item, currentBid: 75, bidCount: 2 }],
      observedAt: "2026-10-10T12:00:10.000Z",
    });
    const sent = fake.world.sent.map((m) => [m.messageName, (m.data as { kind: string }).kind]);
    expect(sent).toEqual([
      ["donationMoment", "total-increase"],
      ["donationMoment", "new-bid"],
    ]);
    expect(fake.replicant<unknown[]>("moments").value).toHaveLength(2);

    await fake.send("activateEvent", { eventId: null });
    expect(fake.replicant<unknown[]>("moments").value).toEqual([]);
  });

  it("routes refreshSource to the event's adapter", async () => {
    const { fake, api } = setup();
    const eventId = await createActiveEvent(fake);
    await expect(fake.send("refreshSource", { eventId })).rejects.toThrow(/isn't running/);

    const refreshed: string[] = [];
    api.registerSource("fake", { label: "Fake" }).onRefreshRequested((id) => refreshed.push(id));
    await fake.send("refreshSource", { eventId });
    expect(refreshed).toEqual([eventId]);
  });

  it("publishes adapter status and log lines", () => {
    const { fake, api } = setup();
    const source = api.registerSource("fake", { label: "Fake" });
    source.setStatus({ state: "error", message: "HTTP 500" });
    source.log("error", "Fetch failed: HTTP 500");

    const [entry] = fake.replicant<RegisteredSourcesReplicant>("sources").value;
    expect(entry).toMatchObject({ id: "fake", label: "Fake", status: { state: "error", message: "HTTP 500" } });
    expect(fake.replicant<{ message: string }[]>("sourceLog").value.map((l) => l.message)).toEqual([
      "Fetch failed: HTTP 500",
    ]);
  });

  it("tells adapters when an event is duplicated", async () => {
    const { fake, api } = setup();
    const seen: [string, string][] = [];
    api.onEventDuplicated((from, to) => seen.push([from, to]));
    const eventId = await createActiveEvent(fake);
    const copyId = (await fake.send("duplicateEvent", { eventId })) as string;
    await Promise.resolve();
    expect(seen).toEqual([[eventId, copyId]]);
  });
});
