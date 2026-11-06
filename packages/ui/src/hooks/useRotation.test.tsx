import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRotation } from "./useRotation.js";

const items = (n: number, tag = "") => Array.from({ length: n }, (_, i) => `${tag}${i}`);

describe("useRotation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("steps through the list and wraps around", () => {
    const { result } = renderHook(() => useRotation(items(5), 2, 1000));
    expect(result.current.visible).toEqual(["0", "1"]);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.visible).toEqual(["2", "3"]);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.visible).toEqual(["4", "0"]);
  });

  it("keeps its place when items change, so a busy night reaches every item", () => {
    const { result, rerender } = renderHook(({ list }) => useRotation(list, 2, 1000), {
      initialProps: { list: items(6, "a") },
    });
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.visible).toEqual(["a4", "a5"]);
    rerender({ list: items(6, "b") });
    expect(result.current.visible).toEqual(["b4", "b5"]);
  });

  it("copes with the list shrinking under it", () => {
    const { result, rerender } = renderHook(({ list }) => useRotation(list, 2, 1000), {
      initialProps: { list: items(6) },
    });
    act(() => void vi.advanceTimersByTime(2000));
    rerender({ list: items(3) });
    expect(result.current.visible).toHaveLength(2);
    rerender({ list: [] });
    expect(result.current.visible).toEqual([]);
  });

  it("shows everything, still, when it all fits", () => {
    const { result } = renderHook(() => useRotation(items(2), 2, 1000));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current.visible).toEqual(["0", "1"]);
  });
});
