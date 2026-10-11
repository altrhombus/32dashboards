import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { infoBarMachine, selectInfoBarView, type InfoBarSegment } from "./infoBar.js";

const seg = (key: string, durationMs = 1000): InfoBarSegment => ({ key, durationMs });

function start(segments: InfoBarSegment[] = [], pinned: InfoBarSegment | null = null) {
  const actor = createActor(infoBarMachine, { input: { segments, pinned } }).start();
  return { actor, view: () => selectInfoBarView(actor.getSnapshot()) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("infoBarMachine", () => {
  it("is empty with nothing to show", () => {
    expect(start().view()).toEqual({ type: "empty" });
  });

  it("rotates through segments using each one's duration", () => {
    const { view } = start([seg("a", 1000), seg("b", 3000)]);
    expect(view()).toMatchObject({ key: "a" });
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ key: "b" });
    vi.advanceTimersByTime(2999);
    expect(view()).toMatchObject({ key: "b" });
    vi.advanceTimersByTime(1);
    expect(view()).toMatchObject({ key: "a" });
  });

  it("keeps its place and timer when the segment list changes", () => {
    const { actor, view } = start([seg("a"), seg("b"), seg("c")]);
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ key: "b" });
    vi.advanceTimersByTime(500);
    actor.send({ type: "SEGMENTS_UPDATED", segments: [seg("new"), seg("b"), seg("c")] });
    expect(view()).toMatchObject({ key: "b" });
    vi.advanceTimersByTime(500);
    expect(view()).toMatchObject({ key: "c" });
  });

  it("moves on when the current segment disappears", () => {
    const { actor, view } = start([seg("a"), seg("b"), seg("c")]);
    vi.advanceTimersByTime(1000);
    actor.send({ type: "SEGMENTS_UPDATED", segments: [seg("a"), seg("c")] });
    expect(view()).toMatchObject({ key: "c" });
  });

  it("holds a pinned segment until it's unpinned", () => {
    const { actor, view } = start([seg("a"), seg("b")]);
    actor.send({ type: "SEGMENTS_UPDATED", segments: [seg("a"), seg("b")], pinned: seg("incentive:1") });
    expect(view()).toEqual({ type: "segment", key: "incentive:1", pinned: true });
    vi.advanceTimersByTime(60_000);
    expect(view()).toMatchObject({ key: "incentive:1" });
    actor.send({ type: "SEGMENTS_UPDATED", segments: [seg("a"), seg("b")], pinned: null });
    expect(view()).toMatchObject({ type: "segment", pinned: false });
  });

  it("interrupts for celebrations, plays them in order, then resumes", () => {
    const { actor, view } = start([seg("a", 10_000)], seg("pin"));
    actor.send({ type: "CELEBRATE", celebration: { key: "milestone:1", durationMs: 5000 } });
    expect(view()).toEqual({ type: "celebration", key: "milestone:1" });

    vi.advanceTimersByTime(3000);
    actor.send({ type: "CELEBRATE", celebration: { key: "milestone:2", durationMs: 5000 } });
    // The second waits for the first to finish rather than cutting it short.
    expect(view()).toEqual({ type: "celebration", key: "milestone:1" });
    vi.advanceTimersByTime(2000);
    expect(view()).toEqual({ type: "celebration", key: "milestone:2" });
    vi.advanceTimersByTime(5000);
    expect(view()).toEqual({ type: "segment", key: "pin", pinned: true });
  });

  it("goes empty when every segment is removed, and recovers", () => {
    const { actor, view } = start([seg("a")]);
    actor.send({ type: "SEGMENTS_UPDATED", segments: [] });
    expect(view()).toEqual({ type: "empty" });
    actor.send({ type: "SEGMENTS_UPDATED", segments: [seg("b")] });
    expect(view()).toMatchObject({ key: "b" });
  });
});
