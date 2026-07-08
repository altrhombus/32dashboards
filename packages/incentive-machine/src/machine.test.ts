import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import type { Incentive } from "@32dashboards/schema";
import { CELEBRATION_DETAIL_MS, CELEBRATION_MESSAGE_MS, incentiveMachine } from "./machine.js";
import { selectCelebrationStage, selectCurrentIncentive, selectIsCelebrating } from "./selectors.js";

function incentive(overrides: Partial<Incentive> & { id: string; name: string; target: number }): Incentive {
  return { active: true, displayNow: false, displayUntilMet: false, ...overrides };
}

describe("incentiveMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in scroller with no incentive shown", () => {
    const actor = createActor(incentiveMachine, { input: { incentives: [], totalRaised: 0 } }).start();
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
    expect(selectCurrentIncentive(actor.getSnapshot())).toBeNull();
  });

  it("moves to showingCycle on a marquee lap when active incentives exist", () => {
    const a = incentive({ id: "a", name: "Match $500", target: 500 });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 0 } }).start();

    actor.send({ type: "MARQUEE_CYCLE_COMPLETE" });

    expect(actor.getSnapshot().matches("showingCycle")).toBe(true);
    expect(selectCurrentIncentive(actor.getSnapshot())?.id).toBe("a");
  });

  it("stays in scroller on a marquee lap when there are no active incentives", () => {
    const actor = createActor(incentiveMachine, { input: { incentives: [], totalRaised: 0 } }).start();
    actor.send({ type: "MARQUEE_CYCLE_COMPLETE" });
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
  });

  it("regression: a displayNow incentive arriving via CONFIG_UPDATED (not initial input) while idle in scroller still preempts", () => {
    // Mirrors the real app: the machine is always created with empty input
    // (config hasn't loaded from SSE yet), then real data arrives later via
    // CONFIG_UPDATED. An earlier version of this machine only checked
    // priority via scroller's `always` block, which doesn't re-fire on a
    // targetless/internal transition -- so this exact sequence left the
    // incentive invisible in the real app despite passing every other test.
    const actor = createActor(incentiveMachine, { input: { incentives: [], totalRaised: 0 } }).start();
    expect(actor.getSnapshot().matches("scroller")).toBe(true);

    const a = incentive({ id: "a", name: "Match $100", target: 100, displayNow: true });
    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 40 });

    expect(actor.getSnapshot().matches("showingNow")).toBe(true);
    expect(selectCurrentIncentive(actor.getSnapshot())?.id).toBe("a");
  });

  it("hasDisplayNow preempts scroller immediately, and stays pinned across updates", () => {
    const a = incentive({ id: "a", name: "Match $500", target: 500, displayNow: true });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 0 } }).start();

    expect(actor.getSnapshot().matches("showingNow")).toBe(true);

    // A later update that still has displayNow=true keeps it pinned (level-triggered, not one-shot).
    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 10 });
    expect(actor.getSnapshot().matches("showingNow")).toBe(true);

    // Admin turns displayNow off -> falls back to scroller.
    const aOff = { ...a, displayNow: false };
    actor.send({ type: "CONFIG_UPDATED", incentives: [aOff], totalRaised: 10 });
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
  });

  it("shows a displayUntilMet incentive continuously until it's met, then celebrates", () => {
    const a = incentive({ id: "a", name: "Match $100", target: 100, displayUntilMet: true });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 0 } }).start();

    expect(actor.getSnapshot().matches("showingUntil")).toBe(true);

    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 100 });
    expect(actor.getSnapshot().matches("celebrating")).toBe(true);
    expect(selectCurrentIncentive(actor.getSnapshot())?.id).toBe("a");
  });

  it("displayNow takes priority over displayUntilMet", () => {
    const until = incentive({ id: "u", name: "Until", target: 100, displayUntilMet: true });
    const now = incentive({ id: "n", name: "Now", target: 200, displayNow: true });
    const actor = createActor(incentiveMachine, { input: { incentives: [until, now], totalRaised: 0 } }).start();

    expect(actor.getSnapshot().matches("showingNow")).toBe(true);
    expect(selectCurrentIncentive(actor.getSnapshot())?.id).toBe("n");
  });

  it("runs the full celebration sequence (message -> detail -> resolve) for a single incentive", () => {
    const a = incentive({ id: "a", name: "Match $100", target: 100 });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 0 } }).start();

    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 100 });
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(true);
    expect(selectCelebrationStage(actor.getSnapshot())).toBe("message");

    vi.advanceTimersByTime(CELEBRATION_MESSAGE_MS + 1);
    expect(selectCelebrationStage(actor.getSnapshot())).toBe("detail");

    vi.advanceTimersByTime(CELEBRATION_DETAIL_MS + 1);
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(false);
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
  });

  it("celebrates two incentives that cross target in the same update sequentially, not simultaneously", () => {
    const a = incentive({ id: "a", name: "A", target: 100 });
    const b = incentive({ id: "b", name: "B", target: 100 });
    const actor = createActor(incentiveMachine, { input: { incentives: [a, b], totalRaised: 0 } }).start();

    // Both cross their target in the same single update.
    actor.send({ type: "CONFIG_UPDATED", incentives: [a, b], totalRaised: 150 });

    expect(selectIsCelebrating(actor.getSnapshot())).toBe(true);
    const firstId = selectCurrentIncentive(actor.getSnapshot())?.id;
    expect(["a", "b"]).toContain(firstId);

    // Finish the first incentive's full celebration.
    vi.advanceTimersByTime(CELEBRATION_MESSAGE_MS + 1);
    vi.advanceTimersByTime(CELEBRATION_DETAIL_MS + 1);

    // Should now be celebrating the SECOND incentive, not scroller yet.
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(true);
    const secondId = selectCurrentIncentive(actor.getSnapshot())?.id;
    expect(secondId).not.toBe(firstId);
    expect(["a", "b"]).toContain(secondId);

    // Finish the second incentive's celebration -> back to scroller.
    vi.advanceTimersByTime(CELEBRATION_MESSAGE_MS + 1);
    vi.advanceTimersByTime(CELEBRATION_DETAIL_MS + 1);
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(false);
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
  });

  it("does not re-celebrate an incentive already marked met on a later update", () => {
    const a = incentive({ id: "a", name: "A", target: 100 });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 100 } }).start();

    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 100 });
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(true);

    vi.advanceTimersByTime(CELEBRATION_MESSAGE_MS + CELEBRATION_DETAIL_MS + 2);
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(false);

    // Another update with the same already-met incentive should not re-trigger a celebration.
    actor.send({ type: "CONFIG_UPDATED", incentives: [a], totalRaised: 105 });
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(false);
  });

  it("cycles through multiple active incentives across successive marquee laps", () => {
    const a = incentive({ id: "a", name: "A", target: 500 });
    const b = incentive({ id: "b", name: "B", target: 500 });
    const actor = createActor(incentiveMachine, { input: { incentives: [a, b], totalRaised: 0 } }).start();

    actor.send({ type: "MARQUEE_CYCLE_COMPLETE" });
    const first = selectCurrentIncentive(actor.getSnapshot())?.id;

    actor.send({ type: "MARQUEE_CYCLE_COMPLETE" });
    const second = selectCurrentIncentive(actor.getSnapshot())?.id;

    expect(new Set([first, second])).toEqual(new Set(["a", "b"]));
    expect(first).not.toBe(second);
  });

  it("ignores inactive incentives entirely", () => {
    const a = incentive({ id: "a", name: "A", target: 100, active: false, displayNow: true });
    const actor = createActor(incentiveMachine, { input: { incentives: [a], totalRaised: 200 } }).start();
    expect(actor.getSnapshot().matches("scroller")).toBe(true);
    expect(selectIsCelebrating(actor.getSnapshot())).toBe(false);
  });
});
