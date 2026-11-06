import { describe, expect, it } from "vitest";
import { judgeLogo } from "./logoBackdrop.js";

/** `n` pixels of one RGBA color. */
const pixels = (...runs: [number, [number, number, number, number]][]) =>
  new Uint8ClampedArray(runs.flatMap(([n, rgba]) => Array.from({ length: n }, () => rgba).flat()));

const DARK_BG = 0.02; // e.g. a midnight purple
const LIGHT_BG = 0.85;

describe("judgeLogo", () => {
  it("plates dark ink on a see-through logo over a dark background", () => {
    expect(judgeLogo(pixels([60, [0, 0, 0, 0]], [40, [20, 20, 20, 255]]), DARK_BG)).toBe(true);
  });

  it("leaves light ink on a dark background alone", () => {
    expect(judgeLogo(pixels([60, [0, 0, 0, 0]], [40, [240, 240, 240, 255]]), DARK_BG)).toBe(false);
  });

  it("plates light ink over a light background", () => {
    expect(judgeLogo(pixels([60, [0, 0, 0, 0]], [40, [235, 235, 235, 255]]), LIGHT_BG)).toBe(true);
  });

  it("leaves logos with their own solid background alone", () => {
    expect(judgeLogo(pixels([100, [20, 20, 20, 255]]), DARK_BG)).toBe(false);
  });
});
