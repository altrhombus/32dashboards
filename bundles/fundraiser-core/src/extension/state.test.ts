import { describe, expect, it } from "vitest";
import type { SourceItem, SourceResult } from "@32dashboards/schema/core";
import * as core from "./state.js";

function makeDeps(): core.Deps {
  let n = 0;
  return {
    now: () => "2026-10-10T12:00:00.000Z",
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  };
}

const empty: core.CoreState = { events: [], activeEventId: null, sourceResults: {} };

function item(title: string): SourceItem {
  return { id: title, title, imageUrl: null, currentBid: null, value: null, bidCount: null, remaining: null };
}

function withEvent(adapterId: string | null = "fake") {
  const deps = makeDeps();
  let { state, eventId } = core.createEvent(empty, { name: "Spring Gala" }, deps);
  state = core.updateEvent(state, { eventId, patch: { source: { adapterId } } }, deps);
  return { state, eventId, deps };
}

function result(eventId: string, total: number, observedAt = "2026-10-10T12:00:00.000Z"): SourceResult {
  return { sourceId: "fake", eventId, total, items: [], observedAt };
}

describe("createEvent", () => {
  it("fills defaults and does not activate the event", () => {
    const { state, eventId } = core.createEvent(empty, { name: "Spring Gala" }, makeDeps());
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ id: eventId, name: "Spring Gala", adjustment: 0, filters: [] });
    expect(state.events[0]?.theme.accentColor).toBe("#ffd700");
    expect(state.activeEventId).toBeNull();
  });
});

describe("updateEvent", () => {
  it("merges theme and askMe patches instead of replacing them", () => {
    const { state, eventId, deps } = withEvent();
    const next = core.updateEvent(
      state,
      { eventId, patch: { theme: { accentColor: "#ff0000" }, askMe: { enabled: true } } },
      deps,
    );
    expect(next.events[0]?.theme).toMatchObject({ accentColor: "#ff0000", secondaryColor: "#4dd0e1" });
    expect(next.events[0]?.askMe).toMatchObject({ enabled: true, title: "Ask Me Spotlight" });
  });

  it("rejects an unknown event", () => {
    expect(() => core.updateEvent(empty, { eventId: "x", patch: {} }, makeDeps())).toThrow(core.CommandError);
  });

  it("leaves other state fields as the same references", () => {
    const { state, eventId, deps } = withEvent();
    const next = core.updateEvent(state, { eventId, patch: { name: "Renamed" } }, deps);
    expect(next.sourceResults).toBe(state.sourceResults);
    expect(next.events).not.toBe(state.events);
  });
});

describe("duplicateEvent", () => {
  it("copies setup with fresh ids and resets how the event went", () => {
    const { state: base, eventId, deps } = withEvent();
    let state = core.updateEvent(
      base,
      {
        eventId,
        patch: {
          incentives: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Match",
              target: 500,
              active: true,
              displayNow: true,
              displayUntilMet: true,
            },
          ],
          askMe: { enabled: true, total: 250 },
        },
      },
      deps,
    );
    state = core.setAdjustment(state, eventId, 300, deps);
    state = core.setFilters(state, eventId, ["raffle"], deps);

    const { state: next, eventId: copyId } = core.duplicateEvent(state, { eventId }, deps);
    const copy = next.events.find((e) => e.id === copyId);

    expect(copyId).not.toBe(eventId);
    expect(copy?.name).toBe("Spring Gala (copy)");
    expect(copy?.adjustment).toBe(0);
    expect(copy?.filters).toEqual(["raffle"]);
    expect(copy?.source.adapterId).toBe("fake");
    expect(copy?.askMe).toMatchObject({ enabled: false, total: 0 });
    expect(copy?.incentives[0]).toMatchObject({ name: "Match", active: false, displayNow: false, displayUntilMet: true });
    expect(copy?.incentives[0]?.id).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(next.activeEventId).toBeNull();
  });
});

describe("deleteEvent / activateEvent", () => {
  it("refuses to delete the active event", () => {
    const { state, eventId } = withEvent();
    const active = core.activateEvent(state, eventId);
    expect(() => core.deleteEvent(active, eventId)).toThrow(/on screen/);
  });

  it("deletes an inactive event and its stored results", () => {
    const { state: base, eventId } = withEvent();
    const { state } = core.recordSourceResult(base, result(eventId, 10));
    const next = core.deleteEvent(state, eventId);
    expect(next.events).toEqual([]);
    expect(next.sourceResults).toEqual({});
  });

  it("rejects activating an unknown event but allows null", () => {
    const { state, eventId } = withEvent();
    expect(() => core.activateEvent(state, "00000000-0000-4000-8000-999999999999")).toThrow(core.CommandError);
    expect(core.activateEvent(core.activateEvent(state, eventId), null).activeEventId).toBeNull();
  });
});

describe("adjustment", () => {
  it("sets and nudges, rounding to cents", () => {
    const { state, eventId, deps } = withEvent();
    let next = core.setAdjustment(state, eventId, 100.005, deps);
    next = core.nudgeAdjustment(next, eventId, 0.1, deps);
    next = core.nudgeAdjustment(next, eventId, 0.2, deps);
    expect(next.events[0]?.adjustment).toBe(100.31);
  });
});

describe("setFilters", () => {
  it("trims, drops blanks, and de-duplicates", () => {
    const { state, eventId, deps } = withEvent();
    const next = core.setFilters(state, eventId, [" raffle ", "", "raffle", "gift card"], deps);
    expect(next.events[0]?.filters).toEqual(["raffle", "gift card"]);
  });
});

describe("recordSourceResult", () => {
  it("stores a result on the event it names, even if another event is active", () => {
    const { state: base, eventId, deps } = withEvent();
    const { state: withSecond, eventId: otherId } = core.createEvent(base, { name: "Other" }, deps);
    const active = core.activateEvent(withSecond, otherId);

    const { state, outcome } = core.recordSourceResult(active, result(eventId, 1234));
    expect(outcome).toBe("stored");
    expect(state.sourceResults[eventId]?.total).toBe(1234);
    expect(state.sourceResults[otherId]).toBeUndefined();
  });

  it("ignores unknown events, other sources, and older results", () => {
    const { state: base, eventId } = withEvent();
    expect(core.recordSourceResult(base, result("00000000-0000-4000-8000-999999999999", 1)).outcome).toBe(
      "unknown-event",
    );
    expect(core.recordSourceResult(base, { ...result(eventId, 1), sourceId: "other" }).outcome).toBe("wrong-source");

    const { state } = core.recordSourceResult(base, result(eventId, 20, "2026-10-10T12:00:05.000Z"));
    const late = core.recordSourceResult(state, result(eventId, 10, "2026-10-10T12:00:01.000Z"));
    expect(late.outcome).toBe("stale");
    expect(late.state).toBe(state);
  });

  it("ignores results for an event with no source configured", () => {
    const { state, eventId } = withEvent(null);
    expect(core.recordSourceResult(state, result(eventId, 1)).outcome).toBe("wrong-source");
  });
});

describe("applyFilters", () => {
  it("hides items whose title contains a filter, case-insensitively", () => {
    const { items, hidden } = core.applyFilters([item("Gift Basket"), item("RAFFLE ticket"), item("Wine")], ["raffle"]);
    expect(items.map((i) => i.title)).toEqual(["Gift Basket", "Wine"]);
    expect(hidden).toBe(1);
  });
});

describe("computeLiveState", () => {
  it("is empty when no event is active", () => {
    expect(core.computeLiveState(empty)).toMatchObject({ event: null, total: 0, items: [], sourceId: null });
  });

  it("applies the adjustment and filters to the active event's result", () => {
    const { state: base, eventId, deps } = withEvent();
    let state = core.activateEvent(base, eventId);
    state = core.setAdjustment(state, eventId, 250.5, deps);
    state = core.setFilters(state, eventId, ["raffle"], deps);
    state = core.recordSourceResult(state, { ...result(eventId, 1000), items: [item("Raffle"), item("Wine")] }).state;

    const live = core.computeLiveState(state);
    expect(live).toMatchObject({ rawTotal: 1000, adjustment: 250.5, total: 1250.5, hiddenItemCount: 1, sourceId: "fake" });
    expect(live.items.map((i) => i.title)).toEqual(["Wine"]);
    expect(live.event?.id).toBe(eventId);
  });
});
