import { describe, expect, it, vi } from "vitest";
import type { FundraiserEvent, LiveStateReplicant, RegisteredSourcesReplicant } from "@32dashboards/schema/core";
import { createFakeNodecg } from "@32dashboards/nodecg-testing";
import { DONATION_GRACE_MS } from "./donations.js";
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

  it("counts every Ask Me tap, even ones sent before the last was seen", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);

    // Two taps from a phone that hasn't heard back from the first yet.
    await Promise.all([
      fake.send("nudgeAskMe", { eventId, delta: 100 }),
      fake.send("nudgeAskMe", { eventId, delta: 100 }),
    ]);

    const events = fake.replicant<{ id: string; askMe: { total: number } }[]>("events").value;
    expect(events.find((e) => e.id === eventId)?.askMe.total).toBe(200);
  });

  it("saves, replaces, and deletes named screens", async () => {
    const { fake } = setup();
    await fake.send("saveScreen", { id: "main-left", name: "Main room left", layouts: { main: "builtin:main" } });
    await fake.send("saveScreen", { id: "lobby", name: "Lobby" });
    await fake.send("saveScreen", { id: "main-left", name: "Left TV", layouts: {} });
    expect(fake.replicant("screens").value).toEqual([
      { id: "main-left", name: "Left TV", layouts: {} },
      { id: "lobby", name: "Lobby", layouts: {} },
    ]);
    await expect(fake.send("saveScreen", { id: "Main Left", name: "x" })).rejects.toThrow(/Screen ids/);
    await expect(fake.send("saveScreen", { id: "x", name: "x", layouts: { nope: "a" } })).rejects.toThrow();
    await fake.send("deleteScreen", { id: "lobby" });
    await expect(fake.send("deleteScreen", { id: "lobby" })).rejects.toThrow(/No screen/);
    expect(fake.replicant<unknown[]>("screens").value).toHaveLength(1);
  });

  it("records which screen an output checked in as", async () => {
    const { fake } = setup();
    await fake.send("outputHeartbeat", { instanceId: "a", output: "kiosk", screenId: "lobby" });
    await fake.send("outputHeartbeat", { instanceId: "b", output: "kiosk" });
    const outputs = fake.replicant<{ instanceId: string; screenId: string | null }[]>("outputs").value;
    expect(outputs.map((o) => [o.instanceId, o.screenId])).toEqual([
      ["a", "lobby"],
      ["b", null],
    ]);
  });

  it("celebrates finished Ask Me rounds, adding them to the total only if the event says so", async () => {
    const { fake, api, live } = setup();
    const eventId = await createActiveEvent(fake);
    api
      .registerSource("fake", { label: "Fake" })
      .report({ eventId, total: 1000, observedAt: new Date().toISOString() });
    await fake.send("nudgeAdjustment", { eventId, delta: 200 });
    await fake.send("nudgeAskMe", { eventId, delta: 500 });
    expect(live().total).toBe(1200);

    // By default the auction counts Ask Me gifts, so the total stays the source's plus venue cash.
    await fake.send("finishAskMeRound", { eventId, amount: 500 });
    expect(live()).toMatchObject({ total: 1200, adjustment: 200, askMeRaised: 500 });
    expect(
      fake.world.sent.filter((m) => m.messageName === "donationMoment").map((m) => (m.data as { kind: string }).kind),
    ).toContain("askme-round");
    await expect(fake.send("finishAskMeRound", { eventId, amount: 500 })).rejects.toThrow(/already added/);

    await fake.send("updateEvent", { eventId, patch: { askMeInTotal: true } });
    expect(live().total).toBe(1700);
    // Setting the counted venue total leaves Ask Me money alone.
    await fake.send("setAdjustment", { eventId, amount: 150 });
    expect(live()).toMatchObject({ total: 1650, askMeRaised: 500 });
  });

  it("goes back to the scene from before Ask Me once the last round finishes", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);
    const scene = () => fake.replicant<{ id: string; message: string | null }>("scene").value;
    const round = (title: string) => ({ id: crypto.randomUUID(), title, message: "", amounts: [], raised: null });
    await fake.send("updateEvent", { eventId, patch: { askMeRounds: [round("One"), round("Two")] } });
    await fake.send("switchScene", { id: "intermission", message: "Dessert" });
    await fake.send("switchScene", { id: "askMe" });

    const roundIds = () =>
      fake
        .replicant<FundraiserEvent[]>("events")
        .value.find((e) => e.id === eventId)!
        .askMeRounds.map((r) => r.id);
    await fake.send("nudgeAskMe", { eventId, delta: 100 });
    await fake.send("finishAskMeRound", { eventId, amount: 100, roundId: roundIds()[0] });
    expect(scene().id).toBe("askMe");

    await fake.send("nudgeAskMe", { eventId, delta: 50 });
    await fake.send("finishAskMeRound", { eventId, amount: 50, roundId: roundIds()[1] });
    expect(scene()).toMatchObject({ id: "intermission", message: "Dessert" });
  });

  it("announces the last minutes before bidding closes, once each", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-01T20:00:00Z"));
      const { fake } = setup();
      const eventId = await createActiveEvent(fake);
      await fake.send("updateEvent", {
        eventId,
        patch: { endDateTime: "2026-05-01T20:10:02Z", celebrateAtClose: true },
      });
      const calls = () =>
        fake.world.sent
          .filter((m) => m.messageName === "donationMoment" && (m.data as { kind: string }).kind === "last-call")
          .map((m) => (m.data as { minutesLeft: number }).minutesLeft);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls()).toEqual([10]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(calls()).toEqual([10]);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(calls()).toEqual([10, 5, 1, 0]);
      expect(fake.replicant<{ id: string }>("scene").value.id).toBe("celebration");
    } finally {
      vi.useRealTimers();
    }
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
    expect(
      api.registerSource("fake", { label: "Fake" }).report({ eventId: "nope", total: -1, observedAt: "later" }),
    ).toBe("invalid");
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
    await createActiveEvent(fake);
    const events = fake.replicant<FundraiserEvent[]>("events");
    events.value = events.value.map((e) => ({ ...e, adjustment: 42 }));
    expect(live().total).toBe(42);
  });

  it("refuses to delete the active event", async () => {
    const { fake } = setup();
    const eventId = await createActiveEvent(fake);
    await expect(fake.send("deleteEvent", { eventId })).rejects.toThrow(/on screen/);
  });

  it("sends donation moments for the active event, thanking only money the bids don't explain", async () => {
    vi.useFakeTimers();
    try {
      const { fake, api } = setup();
      const eventId = await createActiveEvent(fake);
      const source = api.registerSource("fake", { label: "Fake" });
      const item = { id: "a", title: "Guitar", currentBid: 50, bidCount: 1 };
      const sent = () =>
        fake.world.sent.map((m) => [(m.data as { kind: string }).kind, (m.data as { delta?: number }).delta]);

      source.report({ eventId, total: 100, items: [item], observedAt: "2026-10-10T12:00:00.000Z" });
      expect(fake.world.sent).toEqual([]);

      // The total rose 75; the guitar's new bid explains 25 of it.
      source.report({
        eventId,
        total: 175,
        items: [{ ...item, currentBid: 75, bidCount: 2 }],
        observedAt: "2026-10-10T12:00:10.000Z",
      });
      expect(sent()).toEqual([["new-bid", undefined]]);

      // The other 50 is thanked once no bid has explained it for a while.
      await vi.advanceTimersByTimeAsync(DONATION_GRACE_MS + 100);
      expect(sent()).toEqual([
        ["new-bid", undefined],
        ["total-increase", 50],
      ]);
      expect(fake.replicant<unknown[]>("moments").value).toHaveLength(2);

      await fake.send("activateEvent", { eventId: null });
      expect(fake.replicant<unknown[]>("moments").value).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't thank a total that rose a refresh before its bid showed", async () => {
    vi.useFakeTimers();
    try {
      const { fake, api } = setup();
      const eventId = await createActiveEvent(fake);
      const source = api.registerSource("fake", { label: "Fake" });
      const cookies = { id: "c", title: "Cookies", currentBid: 30, bidCount: 0 };
      const at = (s: number) => new Date(Date.UTC(2026, 10, 7, 20, 0, s)).toISOString();
      source.report({ eventId, total: 100, items: [cookies], observedAt: at(0) });
      source.report({ eventId, total: 130, items: [cookies], observedAt: at(10) });
      await vi.advanceTimersByTimeAsync(10_000);
      source.report({ eventId, total: 130, items: [{ ...cookies, bidCount: 1 }], observedAt: at(20) });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.world.sent.map((m) => (m.data as { kind: string }).kind)).toEqual(["new-bid"]);
    } finally {
      vi.useRealTimers();
    }
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
    fake.api.Replicant("events", {
      defaultValue: [{ ...old, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    });
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
      expect(fake.replicant<{ instanceId: string }[]>("outputs").value.map((o) => o.instanceId)).toEqual([
        "tv-1",
        "tv-2",
      ]);
      vi.advanceTimersByTime(45_000);
      expect(fake.replicant<{ instanceId: string }[]>("outputs").value.map((o) => o.instanceId)).toEqual(["tv-2"]);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("money that isn't new", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 7, 20, 0, s)).toISOString();
    const milestones = [1000, 2000, 3000].map((amount, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      amount,
      label: "",
    }));
    async function show() {
      const t = setup();
      const eventId = await createActiveEvent(t.fake);
      await t.fake.send("updateEvent", { eventId, patch: { milestones } });
      const source = t.api.registerSource("fake", { label: "Fake" });
      const sent = () => t.fake.world.sent.filter((m) => m.messageName === "donationMoment").map((m) => m.data);
      const kinds = () => sent().map((m) => (m as { kind: string }).kind);
      return { ...t, eventId, source, sent, kinds };
    }

    it("takes an event's first result as where the total stood, not as milestones reached", async () => {
      const { source, eventId, kinds, live } = await show();
      source.report({ eventId, total: 2500, observedAt: at(1) });
      expect(live().total).toBe(2500);
      expect(kinds()).toEqual([]);
    });

    it("doesn't celebrate again when the total dips and recovers", async () => {
      vi.useFakeTimers();
      try {
        const { source, eventId, kinds } = await show();
        source.report({ eventId, total: 2500, observedAt: at(1) });
        source.report({ eventId, total: 100, observedAt: at(2) });
        source.report({ eventId, total: 2500, observedAt: at(3) });
        vi.advanceTimersByTime(DONATION_GRACE_MS + 1000);
        expect(kinds()).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("remembers the high even if the total hasn't risen since NodeCG started", async () => {
      const { fake, source, eventId, kinds } = await show();
      source.report({ eventId, total: 2500, observedAt: at(1) });
      fake.replicant<Record<string, number>>("totalPeaks").value = {};
      source.report({ eventId, total: 2500, observedAt: at(2) });
      source.report({ eventId, total: 100, observedAt: at(3) });
      source.report({ eventId, total: 2500, observedAt: at(4) });
      expect(kinds()).toEqual([]);
    });

    it("celebrates what's new once the total passes its old high", async () => {
      const { source, eventId, kinds } = await show();
      source.report({ eventId, total: 2500, observedAt: at(1) });
      source.report({ eventId, total: 100, observedAt: at(2) });
      source.report({ eventId, total: 3100, observedAt: at(3) });
      expect(kinds()).toEqual(["milestone"]);
    });

    it("starts over when told to, without celebrating the jump", async () => {
      vi.useFakeTimers();
      try {
        const { source, eventId, kinds } = await show();
        source.report({ eventId, total: 0, observedAt: at(1) });
        source.report({ eventId, total: 2500, observedAt: at(2), baseline: true });
        vi.advanceTimersByTime(DONATION_GRACE_MS + 1000);
        expect(kinds()).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("celebrates a hand-entered source's first amount", async () => {
      const { api, fake, eventId, kinds } = await show();
      await fake.send("updateEvent", { eventId, patch: { source: { adapterId: "typed" } } });
      const typed = api.registerSource("typed", { label: "Typed", handEntered: true });
      typed.report({ eventId, total: 1500, observedAt: at(1) });
      expect(kinds()).toEqual(["milestone"]);
    });

    it("doesn't thank or celebrate an undo that puts money back", async () => {
      const { fake, source, eventId, kinds } = await show();
      source.report({ eventId, total: 900, observedAt: at(1) });
      await fake.send("nudgeAdjustment", { eventId, delta: -500 });
      await fake.send("nudgeAdjustment", { eventId, delta: 700, quiet: true });
      expect(kinds()).toEqual([]);
    });

    it("lets money taken off be reached again", async () => {
      const { fake, source, eventId, kinds } = await show();
      source.report({ eventId, total: 900, observedAt: at(1) });
      await fake.send("nudgeAdjustment", { eventId, delta: 200 });
      expect(kinds()).toEqual(["milestone", "total-increase"]);
      await fake.send("nudgeAdjustment", { eventId, delta: -200 });
      await fake.send("nudgeAdjustment", { eventId, delta: 200 });
      expect(kinds()).toEqual(["milestone", "total-increase", "milestone", "total-increase"]);
    });

    it("stamps a sold live item on the TV, and doesn't thank a live sale as a donation", async () => {
      const { fake, eventId, sent, kinds } = await show();
      const lotId = "00000000-0000-4000-8000-000000000099";
      const lot = { id: lotId, title: "Lake house" };
      await fake.send("updateEvent", { eventId, patch: { liveLots: [lot] } });
      await fake.send("sellLiveLot", { eventId, lotId, amount: 900, paddle: "42" });
      expect(kinds()).toEqual(["live-sold"]);
      expect(sent()[0]).toMatchObject({ title: "Lake house", amount: 900, paddle: "42" });
    });

    it("lets a sale added to the total reach a milestone, and undoing it reach it again", async () => {
      const { fake, eventId, kinds } = await show();
      const lotId = "00000000-0000-4000-8000-000000000099";
      await fake.send("updateEvent", { eventId, patch: { liveInTotal: true, liveLots: [{ id: lotId, title: "A" }] } });
      await fake.send("sellLiveLot", { eventId, lotId, amount: 1200 });
      expect(kinds()).toEqual(["milestone", "live-sold"]);
      await fake.send("reopenLiveLot", { eventId, lotId });
      await fake.send("sellLiveLot", { eventId, lotId, amount: 1200 });
      expect(kinds()).toEqual(["milestone", "live-sold", "milestone", "live-sold"]);
    });

    it("leaves the TVs on the live auction when bidding closes", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-11-07T20:00:00.000Z"));
        const { fake, eventId } = await show();
        const endDateTime = "2026-11-07T20:00:30.000Z";
        await fake.send("updateEvent", { eventId, patch: { endDateTime, celebrateAtClose: true } });
        await fake.send("switchScene", { id: "liveAuction" });
        await vi.advanceTimersByTimeAsync(40_000);
        expect(fake.replicant<{ id: string }>("scene").value.id).toBe("liveAuction");
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the moments list", async () => {
      const { fake, eventId } = await show();
      await fake.send("nudgeAdjustment", { eventId, delta: 20 });
      expect(fake.replicant<unknown[]>("moments").value).toHaveLength(1);
      await fake.send("clearMoments", undefined);
      expect(fake.replicant<unknown[]>("moments").value).toEqual([]);
    });
  });
});
