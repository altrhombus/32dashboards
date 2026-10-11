import { describe, expect, it } from "vitest";
import { parseCount, parseMoney } from "./money.js";

describe("parseMoney", () => {
  it("parses display strings", () => {
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney("$500")).toBe(500);
    expect(parseMoney("USD 50")).toBe(50);
  });

  it("returns null instead of 0 for missing or garbage input", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("N/A")).toBeNull();
  });
});

describe("parseCount", () => {
  it("parses the first whole number", () => {
    expect(parseCount("3")).toBe(3);
    expect(parseCount("1,204 bids")).toBe(1204);
    expect(parseCount("none")).toBeNull();
    expect(parseCount(null)).toBeNull();
  });
});
