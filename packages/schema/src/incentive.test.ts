import { describe, expect, it } from "vitest";
import { IncentiveSchema } from "./index.js";

const validIncentive = {
  id: "8c1f2a4e-1b2c-4d3e-9f5a-1234567890ab",
  name: "Match the next $500",
  target: 500,
  active: true,
  displayNow: false,
  displayUntilMet: true,
};

describe("IncentiveSchema", () => {
  it("accepts a valid incentive", () => {
    expect(IncentiveSchema.parse(validIncentive)).toEqual(validIncentive);
  });

  it("rejects a negative target", () => {
    expect(() => IncentiveSchema.parse({ ...validIncentive, target: -1 })).toThrow();
  });

  it("rejects a name over 200 chars", () => {
    expect(() => IncentiveSchema.parse({ ...validIncentive, name: "x".repeat(201) })).toThrow();
  });
});
