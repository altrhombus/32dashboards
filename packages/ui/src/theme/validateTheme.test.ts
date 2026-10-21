import { describe, expect, it } from "vitest";
import { ThemeSchema } from "@32dashboards/schema";
import { contrastRatio, parseHexColor, validateTheme } from "./validateTheme.js";

const base = ThemeSchema.parse({});

describe("contrastRatio", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio(parseHexColor("#000")!, parseHexColor("#fff")!)).toBeCloseTo(21, 0);
    expect(contrastRatio(parseHexColor("#777777")!, parseHexColor("#ffffff")!)).toBeCloseTo(4.48, 2);
  });
});

describe("validateTheme", () => {
  it("flags an out-of-range accent only as a warning", () => {
    const issues = validateTheme({ ...base, accentColor: "#ffd700" });
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.map((i) => i.field)).toContain("accentColor");
  });

  it("errors on unreadable combinations", () => {
    const issues = validateTheme({ ...base, backgroundFrom: "#d0d0d0", accentColor: "#202840" });
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", field: "backgroundFrom" }));
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", field: "accentColor" }));
  });

  it("errors on colors it can't read", () => {
    expect(validateTheme({ ...base, secondaryColor: "teal" })).toContainEqual(
      expect.objectContaining({ level: "error", field: "secondaryColor" }),
    );
  });

  it("passes a broadcast-safe, high-contrast theme", () => {
    const safe = { ...base, accentColor: "#ebc314", secondaryColor: "#4dd0e1", backgroundFrom: "#181c2a", backgroundTo: "#23284a" };
    expect(validateTheme(safe)).toEqual([]);
  });
});
