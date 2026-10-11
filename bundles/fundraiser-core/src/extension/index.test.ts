import { describe, expect, it, vi } from "vitest";
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

  it("celebrates a milestone crossed by an adjustment", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);
    await fake.send("updateEvent", {
      eventId,
      patch: { milestones: [{ id: "11111111-1111-4111-8111-111111111111", amount: 100, label: "Century" }] },
    });
    await fake.send("nudgeAdjustment", { eventId, delta: 150 });
    const kinds = fake.world.sent.map((m) => (m.data as { kind: string }).kind).sort();
    expect(kinds).toEqual(["milestone", "total-increase"]);
  });

  it("switches scenes", async () => {
    const { fake } = setup();
    expect(fake.replicant<{ id: string }>("scene").value.id).toBe("main");
    await fake.send("switchScene", { id: "intermission", countdownTo: "2026-10-10T20:00:00.000Z", message: "Dinner!" });
    expect(fake.replicant("scene").value).toMatchObject({ id: "intermission", message: "Dinner!" });
    await expect(fake.send("switchScene", { id: "nope" })).rejects.toThrow(/id/);
  });

  it("fills defaults for events stored by an older version", () => {
    const fake = createFakeNodecg();
    const old = { id: "11111111-1111-4111-8111-111111111111", name: "Old", theme: {}, askMe: {}, source: {} };
    fake.api.Replicant("events", { defaultValue: [{ ...old, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }] });
    fundraiserCore(fake.api);
    expect(fake.replicant<FundraiserEvent[]>("events").value[0]).toMatchObject({
      milestones: [],
      bidWars: [],
      infoBar: { segmentSeconds: 12 },
    });
  });

  it("celebrates cash added at the venue, but not corrections", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);
    await fake.send("nudgeAdjustment", { eventId, delta: 40 });
    await fake.send("nudgeAdjustment", { eventId, delta: -10 });
    await fake.send("setAdjustment", { eventId, amount: 500 });
    expect(fake.world.sent.map((m) => m.data)).toEqual([
      expect.objectContaining({ kind: "total-increase", delta: 40, total: 40 }),
    ]);
  });

  it("tracks outputs that check in, and drops ones that stop", async () => {
    vi.useFakeTimers();
    try {
      const { fake } = setup();
      await fake.send("outputHeartbeat", { instanceId: "tv-1", output: "kiosk" });
      vi.advanceTimersByTime(30_000);
      await fake.send("outputHeartbeat", { instanceId: "tv-2", output: "kiosk" });
      expect(fake.replicant<{ instanceId: string }[]>("outputs").value.map((o) => o.instanceId)).toEqual(["tv-1", "tv-2"]);
      vi.advanceTimersByTime(45_000);
      expect(fake.replicant<{ instanceId: string }[]>("outputs").value.map((o) => o.instanceId)).toEqual(["tv-2"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
