import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount.js";

describe("parseAmount", () => {
  it("reads amounts the way people type them", () => {
    expect(parseAmount("75")).toBe(75);
    expect(parseAmount("$1,250.50")).toBe(1250.5);
    expect(parseAmount(" 20.005 ")).toBe(20.01);
  });

  it("refuses empty, zero, negative and non-numbers", () => {
    for (const text of ["", "  ", "0", "-5", "abc", "$"]) expect(parseAmount(text)).toBeNull();
  });
});
