import { describe, expect, it } from "vitest";
import { rebase } from "./rebase.js";

const item = (id: string, title: string, bid: number | null) => ({ id, title, bid });

describe("rebase", () => {
  it("takes the other device's change to a field that wasn't touched here", () => {
    const before = [item("a", "Boat", 100)];
    const saved = [item("a", "Boat", 250)];
    expect(rebase(before, before, saved)).toEqual(saved);
  });

  it("keeps what's being typed here", () => {
    const before = [item("a", "Boat", 100)];
    const local = [item("a", "Boat ri", 100)];
    const saved = [item("a", "Boat", 250)];
    expect(rebase(local, before, saved)).toEqual([item("a", "Boat ri", 250)]);
  });

  it("follows the saved order and items", () => {
    const before = [item("a", "A", null), item("b", "B", null)];
    const saved = [item("b", "B", null), item("a", "A", null), item("c", "C", null)];
    expect(rebase(before, before, saved).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
