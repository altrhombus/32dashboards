import { describe, expect, it } from "vitest";
import { formatAmount, formatTotal } from "./format.js";

describe("formatTotal", () => {
  it("shows whole dollars, rounding down", () => {
    expect(formatTotal(12345.99)).toBe("$12,345");
    expect(formatTotal(0)).toBe("$0");
    expect(formatTotal(99_999_999.99)).toBe("$99,999,999");
  });

  it("never shows a negative total", () => {
    expect(formatTotal(-20)).toBe("$0");
  });
});

describe("formatAmount", () => {
  it("rounds to whole dollars", () => {
    expect(formatAmount(59.5)).toBe("$60");
    expect(formatAmount(1234.4)).toBe("$1,234");
  });
});
