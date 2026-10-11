import { describe, expect, it } from "vitest";
import type { FundraiserEvent, LiveStateReplicant, RegisteredSourcesReplicant } from "@32dashboards/schema/core";
import { createFakeNodecg } from "../testing/fakeNodecg.js";
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
    const source = api.registerSource("fake");

    expect(source.report({ eventId, total: 1000, observedAt: new Date().toISOString() })).toBe("stored");
    await fake.send("nudgeAdjustment", { eventId, delta: 100 });
    await fake.send("nudgeAdjustment", { eventId, delta: 50 });

    expect(live()).toMatchObject({ rawTotal: 1000, adjustment: 150, total: 1150, sourceId: "fake" });
  });

  it("keeps a late result on the event it was fetched for", async () => {
    const { fake, api, live } = setup();
    const first = await createActiveEvent(fake);
    const source = api.registerSource("fake");
    const observedAt = new Date().toISOString();

    const second = (await fake.send("createEvent", { name: "Fall Gala" })) as string;
    await fake.send("activateEvent", { eventId: second });
    source.report({ eventId: first, total: 999, observedAt });

    expect(live()).toMatchObject({ total: 0, event: { id: second } });
    expect(fake.replicant<Record<string, { total: number }>>("sourceResults").value[first]?.total).toBe(999);
  });

  it("rejects invalid reports without throwing", () => {
    const { api } = setup();
    expect(api.registerSource("fake").report({ eventId: "nope", total: -1, observedAt: "later" })).toBe("invalid");
  });

  it("lists registered sources and refuses duplicates", () => {
    const { fake, api } = setup();
    api.registerSource("fake");
    expect(fake.replicant<RegisteredSourcesReplicant>("sources").value.map((s) => s.id)).toEqual(["fake"]);
    expect(() => api.registerSource("fake")).toThrow(/already registered/);
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
});
