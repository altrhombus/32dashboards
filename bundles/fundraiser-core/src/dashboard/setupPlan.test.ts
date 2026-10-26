import { describe, expect, it } from "vitest";
import { MAX_MILESTONES, isoToLocalInput, localInputToIso, milestoneAmounts } from "./setupPlan.js";

describe("milestoneAmounts", () => {
  it("steps up to the limit", () => {
    expect(milestoneAmounts(1000, 5000)).toEqual([1000, 2000, 3000, 4000, 5000]);
    expect(milestoneAmounts(2500, 9000)).toEqual([2500, 5000, 7500]);
  });

  it("caps the count and refuses nonsense", () => {
    expect(milestoneAmounts(100, 1_000_000)).toHaveLength(MAX_MILESTONES);
    expect(milestoneAmounts(0, 1000)).toEqual([]);
    expect(milestoneAmounts(1000, 500)).toEqual([]);
    expect(milestoneAmounts(Number.NaN, 1000)).toEqual([]);
  });
});

describe("local date inputs", () => {
  it("round-trips through the browser's time zone", () => {
    const iso = localInputToIso("2026-10-24T21:00")!;
    expect(isoToLocalInput(iso)).toBe("2026-10-24T21:00");
    expect(localInputToIso("")).toBeNull();
    expect(isoToLocalInput(null)).toBe("");
  });
});
