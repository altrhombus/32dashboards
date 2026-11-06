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
  const created = core.createEvent(empty, { name: "Spring Gala" }, deps);
  const { eventId } = created;
  const state = core.updateEvent(created.state, { eventId, patch: { source: { adapterId } } }, deps);
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
    expect(state.events[0]?.theme.accentColor).toBe("#ebc81e");
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
    expect(copy?.incentives[0]).toMatchObject({
      name: "Match",
      active: false,
      displayNow: false,
      displayUntilMet: true,
    });
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

const round = (id: string, title: string) => ({ id, title, message: "", raised: null });

describe("Ask Me rounds", () => {
  it("adds a repeating appeal's round to the total, starts again at $0, and won't add it twice", () => {
    const { state, eventId, deps } = withEvent();
    let next = core.nudgeAskMe(state, eventId, 1250, deps);
    next = core.finishAskMeRound(next, eventId, 1250, undefined, deps);
    expect(next.events[0]).toMatchObject({ askMeRaised: 1250, askMe: { total: 0 } });
    expect(() => core.finishAskMeRound(next, eventId, 1250, undefined, deps)).toThrow(/already added/);

    next = core.nudgeAskMe(next, eventId, 300, deps);
    expect(() => core.finishAskMeRound(next, eventId, 250, undefined, deps)).toThrow(/now 300/);
    next = core.reopenAskMeRound(
      core.finishAskMeRound(next, eventId, 300, undefined, deps),
      eventId,
      300,
      undefined,
      deps,
    );
    expect(next.events[0]).toMatchObject({ askMeRaised: 1250, askMe: { total: 300 } });
  });

  it("moves through planned rounds, recording what each raised, and steps back on Undo", () => {
    const { state, eventId, deps } = withEvent();
    const [a, b, c] = [deps.newId(), deps.newId(), deps.newId()];
    let next = core.updateEvent(
      state,
      { eventId, patch: { askMeRounds: [round(a, "Kennels"), round(b, "Vet care"), round(c, "Van")] } },
      deps,
    );
    next = core.finishAskMeRound(core.nudgeAskMe(next, eventId, 1250, deps), eventId, 1250, a, deps);
    expect(next.events[0]).toMatchObject({ askMeCurrent: 1, askMeRaised: 1250, askMe: { total: 0 } });
    expect(next.events[0]!.askMeRounds.map((r) => r.raised)).toEqual([1250, null, null]);
    expect(() => core.finishAskMeRound(next, eventId, 0, a, deps)).toThrow(/already finished/);

    // A round that raised nothing can be skipped.
    next = core.finishAskMeRound(next, eventId, 0, b, deps);
    next = core.finishAskMeRound(core.nudgeAskMe(next, eventId, 800, deps), eventId, 800, c, deps);
    expect(next.events[0]).toMatchObject({ askMeCurrent: 3, askMeRaised: 2050 });

    next = core.reopenAskMeRound(next, eventId, 800, c, deps);
    expect(next.events[0]).toMatchObject({ askMeCurrent: 2, askMeRaised: 1250, askMe: { total: 800 } });
    expect(() => core.reopenAskMeRound(next, eventId, 1250, a, deps)).toThrow(/most recently finished/);
  });

  it("starts a copied event's rounds over", () => {
    const { state, eventId, deps } = withEvent();
    let next = core.updateEvent(state, { eventId, patch: { askMeRounds: [round(deps.newId(), "Kennels")] } }, deps);
    next = core.finishAskMeRound(
      core.nudgeAskMe(next, eventId, 100, deps),
      eventId,
      100,
      next.events[0]!.askMeRounds[0]!.id,
      deps,
    );
    const copy = core.duplicateEvent(next, { eventId }, deps);
    const copied = copy.state.events.find((e) => e.id === copy.eventId)!;
    expect(copied).toMatchObject({ askMeCurrent: 0, askMeRaised: 0 });
    expect(copied.askMeRounds[0]).toMatchObject({ title: "Kennels", raised: null });
  });
});

describe("nudgeAskMe", () => {
  it("adds to the Ask Me total, rounding to cents and never going below zero", () => {
    const { state, eventId, deps } = withEvent();
    let next = core.nudgeAskMe(state, eventId, 100, deps);
    next = core.nudgeAskMe(next, eventId, 0.105, deps);
    expect(next.events[0]?.askMe.total).toBe(100.11);
    next = core.nudgeAskMe(next, eventId, -500, deps);
    expect(next.events[0]?.askMe.total).toBe(0);
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
    expect(live).toMatchObject({
      rawTotal: 1000,
      adjustment: 250.5,
      total: 1250.5,
      hiddenItemCount: 1,
      sourceId: "fake",
    });
    expect(live.items.map((i) => i.title)).toEqual(["Wine"]);
    expect(live.event?.id).toBe(eventId);
  });
});

describe("compareResults", () => {
  const deps = makeDeps();
  const { state: base, eventId } = withEvent();
  const event = core.setFilters(base, eventId, ["raffle"], deps).events[0]!;
  const bid = (id: string, title: string, currentBid: number | null, bidCount: number | null): SourceItem => ({
    ...item(title),
    id,
    currentBid,
    bidCount,
  });
  const at = (total: number, items: SourceItem[]) => ({ ...result(eventId, total), items });

  it("yields nothing for the first result", () => {
    expect(core.compareResults(undefined, result(eventId, 100), event, deps)).toEqual({
      bids: [],
      totalDelta: 0,
      fromBids: 0,
    });
  });

  it("reports the total's change, up or down", () => {
    expect(core.compareResults(result(eventId, 100), result(eventId, 125.5), event, deps).totalDelta).toBe(25.5);
    expect(core.compareResults(result(eventId, 100), result(eventId, 90), event, deps).totalDelta).toBe(-10);
  });

  it("celebrates more bids or a higher bid on visible items only", () => {
    const previous = at(100, [
      bid("a", "Guitar", 50, 1),
      bid("b", "Raffle", 5, 1),
      bid("c", "Wine", 20, 2),
      bid("d", "Hat", null, null),
    ]);
    const next = at(100, [
      bid("a", "Guitar", 60, 2),
      bid("b", "Raffle", 10, 2),
      bid("c", "Wine", 20, 2),
      bid("d", "Hat", 5, 1),
      bid("e", "New item", 99, 9),
    ]);
    const { bids } = core.compareResults(previous, next, event, deps);
    expect(bids).toEqual([
      expect.objectContaining({ kind: "new-bid", itemId: "a", amount: 60, bidCount: 2, newBids: 1 }),
    ]);
  });

  it("counts what bids added to the total, hidden items included", () => {
    const previous = at(100, [bid("a", "Cookies", 50, 1), bid("b", "Raffle", 5, 1)]);
    const next = at(155, [bid("a", "Cookies", 80, 4), bid("b", "Raffle", 10, 2)]);
    expect(core.compareResults(previous, next, event, deps)).toMatchObject({ totalDelta: 55, fromBids: 35 });
  });

  it("counts a first bid at the opening price, and each sale of an item with several to sell", () => {
    // Before anyone bids, an item shows its opening price as its current bid.
    expect(core.bidMoney(bid("a", "Pie", 50, 0), bid("a", "Pie", 50, 1))).toBe(50);
    expect(core.bidMoney(bid("a", "Pie", 50, 0), bid("a", "Pie", 60, 1))).toBe(60);
    // Several to sell at a fixed price: each new "bid" adds the price.
    expect(core.bidMoney(bid("a", "Pie", 30, 1), bid("a", "Pie", 30, 3))).toBe(60);
    // Outbid: the new high bid replaces the old one in the total.
    expect(core.bidMoney(bid("a", "Pie", 30, 1), bid("a", "Pie", 45, 2))).toBe(15);
    expect(core.bidMoney(undefined, bid("a", "Pie", 30, 0))).toBe(0);
  });

  it("counts Buy Now purchases as bids: each one bought adds its price", () => {
    const tea = { ...bid("t", "Garden tour", 100, null), available: 11 };
    const { bids, fromBids } = core.compareResults(at(100, [tea]), at(300, [{ ...tea, available: 9 }]), event, deps);
    expect(fromBids).toBe(200);
    expect(bids).toEqual([expect.objectContaining({ itemId: "t", amount: 100, newBids: 2, purchase: true })]);
  });

  it("caps new-bid moments per result", () => {
    const items = Array.from({ length: 20 }, (_, i) => bid(String(i), `Item ${i}`, 10, 1));
    const previous = at(100, items);
    const next = at(
      100,
      items.map((i) => ({ ...i, bidCount: 2 })),
    );
    expect(core.compareResults(previous, next, event, deps).bids).toHaveLength(core.MAX_BID_MOMENTS_PER_RESULT);
  });
});

describe("nudgeBidWar", () => {
  it("adds to one option and refuses to go negative", () => {
    const { state: base, eventId, deps } = withEvent();
    const war = {
      id: deps.newId(),
      name: "Puppy name",
      description: "",
      active: true,
      options: [{ id: deps.newId(), name: "Biscuit", total: 0 }],
    };
    const optionId = war.options[0]!.id;
    let state = core.updateEvent(base, { eventId, patch: { bidWars: [war] } }, deps);
    state = core.nudgeBidWar(state, { eventId, bidWarId: war.id, optionId, delta: 25 }, deps);
    expect(state.events[0]?.bidWars[0]?.options[0]?.total).toBe(25);
    expect(() => core.nudgeBidWar(state, { eventId, bidWarId: war.id, optionId, delta: -30 }, deps)).toThrow(/below/);
    expect(() => core.nudgeBidWar(state, { eventId, bidWarId: war.id, optionId: "x", delta: 1 }, deps)).toThrow(
      /no longer exists/,
    );
  });

  it("duplicating an event resets bid war totals", () => {
    const { state: base, eventId, deps } = withEvent();
    const war = {
      id: deps.newId(),
      name: "Puppy name",
      description: "",
      active: true,
      options: [{ id: deps.newId(), name: "Biscuit", total: 40 }],
    };
    const state = core.updateEvent(base, { eventId, patch: { bidWars: [war] } }, deps);
    const { state: next, eventId: copyId } = core.duplicateEvent(state, { eventId }, deps);
    const copy = next.events.find((e) => e.id === copyId);
    expect(copy?.bidWars[0]).toMatchObject({ name: "Puppy name", options: [{ name: "Biscuit", total: 0 }] });
    expect(copy?.bidWars[0]?.id).not.toBe(war.id);
  });
});

describe("detectThresholdMoments", () => {
  const deps = makeDeps();
  const { state: base, eventId } = withEvent();
  const state = core.activateEvent(
    core.updateEvent(
      base,
      {
        eventId,
        patch: {
          milestones: [
            { id: deps.newId(), amount: 1000, label: "First grand" },
            { id: deps.newId(), amount: 500, label: "" },
          ],
          incentives: [
            { id: deps.newId(), name: "Match", target: 750, active: true, displayNow: false, displayUntilMet: false },
            { id: deps.newId(), name: "Hidden", target: 600, active: false, displayNow: false, displayUntilMet: false },
          ],
        },
      },
      deps,
    ),
    eventId,
  );
  const live = (total: number, s = state) => {
    const l = core.computeLiveState(s);
    return { ...l, total };
  };

  it("reports thresholds crossed going up, lowest first", () => {
    const moments = core.detectThresholdMoments(live(400), live(1000), deps);
    expect(moments.map((m) => m.kind + ":" + ("amount" in m ? m.amount : "target" in m ? m.target : ""))).toEqual([
      "milestone:500",
      "milestone:1000",
      "incentive-met:750",
    ]);
  });

  it("ignores decreases, already-passed thresholds, and event switches", () => {
    expect(core.detectThresholdMoments(live(1000), live(400), deps)).toEqual([]);
    expect(core.detectThresholdMoments(live(1000), live(1200), deps)).toEqual([]);
    const other = { ...live(0), event: { ...live(0).event!, id: "00000000-0000-4000-8000-999999999999" } };
    expect(core.detectThresholdMoments(other, live(2000), deps)).toEqual([]);
  });
});

describe("editing while the show runs", () => {
  const rounds = (deps: core.Deps) =>
    ["One", "Two", "Three"].map((title) => ({ id: deps.newId(), title, message: "", raised: null }));

  function running() {
    const { state, eventId, deps } = withEvent();
    const planned = core.updateEvent(state, { eventId, patch: { askMeRounds: rounds(deps) } }, deps);
    const first = planned.events[0]!.askMeRounds[0]!;
    const tapped = core.nudgeAskMe(planned, eventId, 100, deps);
    return { state: core.finishAskMeRound(tapped, eventId, 100, first.id, deps), eventId, deps, first };
  }

  it("keeps what a finished round raised, whatever an older editor sends", () => {
    const { state, eventId, deps, first } = running();
    const stale = state.events[0]!.askMeRounds.map((r) => ({ ...r, raised: null, title: `${r.title}!` }));
    const next = core.updateEvent(state, { eventId, patch: { askMeRounds: stale } }, deps).events[0]!;
    expect(next.askMeRounds[0]).toMatchObject({ id: first.id, title: "One!", raised: 100 });
    expect(next.askMeCurrent).toBe(1);
  });

  it("can't lose a finished round, or put one behind the rounds to come", () => {
    const { state, eventId, deps, first } = running();
    const [, second, third] = state.events[0]!.askMeRounds;
    const next = core.updateEvent(state, { eventId, patch: { askMeRounds: [third!, second!] } }, deps).events[0]!;
    expect(next.askMeRounds.map((r) => r.title)).toEqual(["One", "Three", "Two"]);
    expect(next.askMeRounds[0]!.id).toBe(first.id);
    expect(next.askMeCurrent).toBe(1);
  });

  it("stays on the round on now when one still to come is removed", () => {
    const { state, eventId, deps } = running();
    const [one, two] = state.events[0]!.askMeRounds;
    const next = core.updateEvent(state, { eventId, patch: { askMeRounds: [one!, two!] } }, deps).events[0]!;
    expect(next.askMeRounds[next.askMeCurrent]!.title).toBe("Two");
  });

  it("refuses to undo a tap once its round has finished, leaving the round on now alone", () => {
    const { state, eventId, deps, first } = running();
    const later = core.nudgeAskMe(state, eventId, 50, deps);
    expect(() => core.nudgeAskMe(later, eventId, -100, deps, { id: first.id, raised: 0 })).toThrow(/has finished/);
  });

  it("undoes a tap in the round on now", () => {
    const { state, eventId, deps } = running();
    const current = state.events[0]!.askMeRounds[1]!;
    const tapped = core.nudgeAskMe(state, eventId, 50, deps);
    const undone = core.nudgeAskMe(tapped, eventId, -50, deps, { id: current.id, raised: 100 });
    expect(undone.events[0]!.askMe.total).toBe(0);
  });

  it("tells repeats of one appeal apart when there's no plan", () => {
    const { state, eventId, deps } = withEvent();
    const tapped = core.nudgeAskMe(state, eventId, 100, deps);
    const finished = core.finishAskMeRound(tapped, eventId, 100, undefined, deps);
    const again = core.nudgeAskMe(finished, eventId, 150, deps);
    expect(() => core.nudgeAskMe(again, eventId, -100, deps, { id: null, raised: 0 })).toThrow(/has finished/);
  });

  it("keeps bid war totals, whatever an older editor sends", () => {
    const { state, eventId, deps } = withEvent();
    const option = { id: deps.newId(), name: "Biscuit", total: 0 };
    const war = { id: deps.newId(), name: "Name the cat", description: "", active: true, options: [option] };
    const created = core.updateEvent(state, { eventId, patch: { bidWars: [war] } }, deps);
    const nudged = core.nudgeBidWar(created, { eventId, bidWarId: war.id, optionId: option.id, delta: 25 }, deps);
    const renamed = { ...war, name: "Name the kitten" };
    const next = core.updateEvent(nudged, { eventId, patch: { bidWars: [renamed] } }, deps).events[0]!;
    expect(next.bidWars[0]).toMatchObject({ name: "Name the kitten", options: [{ total: 25 }] });
  });

  it("pins one incentive, unpinning the others", () => {
    const { state, eventId, deps } = withEvent();
    const incentive = (name: string) => ({
      id: deps.newId(),
      name,
      target: 100,
      active: true,
      displayNow: false,
      displayUntilMet: false,
    });
    const [a, b] = [incentive("A"), incentive("B")];
    const made = core.updateEvent(state, { eventId, patch: { incentives: [a, b] } }, deps);
    const pinned = core.pinIncentive(core.pinIncentive(made, eventId, a.id, deps), eventId, b.id, deps);
    expect(pinned.events[0]!.incentives.map((i) => i.displayNow)).toEqual([false, true]);
    expect(core.pinIncentive(pinned, eventId, null, deps).events[0]!.incentives.some((i) => i.displayNow)).toBe(false);
  });

  it("celebrates a milestone only past the highest total so far", () => {
    const { state, eventId, deps } = withEvent();
    const milestones = [{ id: deps.newId(), amount: 1000, label: "" }];
    const made = { ...core.updateEvent(state, { eventId, patch: { milestones } }, deps), activeEventId: eventId };
    const at = (total: number) =>
      core.computeLiveState({ ...made, sourceResults: { [eventId]: result(eventId, total) } });
    expect(core.detectThresholdMoments(at(900), at(1100), deps, 900)).toHaveLength(1);
    expect(core.detectThresholdMoments(at(900), at(1100), deps, 1100)).toHaveLength(0);
  });
});
