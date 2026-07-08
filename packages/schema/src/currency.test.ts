import { describe, expect, it } from "vitest";
import { parseCurrencyValue, formatCurrency } from "./currency.js";

describe("parseCurrencyValue", () => {
  it("parses a plain dollar string", () => {
    expect(parseCurrencyValue("$12,345.67")).toBe(12345.67);
  });

  it("parses a whole-dollar string with no cents", () => {
    expect(parseCurrencyValue("$500")).toBe(500);
  });

  it("returns 0 for null/undefined/empty input", () => {
    expect(parseCurrencyValue(null)).toBe(0);
    expect(parseCurrencyValue(undefined)).toBe(0);
    expect(parseCurrencyValue("")).toBe(0);
  });

  it("returns 0 for garbage input", () => {
    expect(parseCurrencyValue("N/A")).toBe(0);
  });

  it("handles values with no currency symbol", () => {
    expect(parseCurrencyValue("1,234")).toBe(1234);
  });
});

describe("formatCurrency", () => {
  it("formats whole numbers with no decimals", () => {
    expect(formatCurrency(500)).toBe("$500");
  });

  it("formats fractional numbers with two decimals", () => {
    expect(formatCurrency(12345.67)).toBe("$12,345.67");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });
});
