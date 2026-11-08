import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskMeOverlay } from "./AskMeOverlay.js";

const askMe = (total: number) => ({
  enabled: true,
  title: "Fund a kennel",
  message: "Raise your paddle",
  total,
  amounts: [],
});

describe("AskMeOverlay", () => {
  afterEach(() => vi.useRealTimers());

  it("pops up each amount on its own, above the total, even when they come quickly", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AskMeOverlay askMe={askMe(100)} />);
    const slot = container.querySelector(".ask-me-overlay__delta-slot")!;
    const shown = () => [...slot.querySelectorAll(".ask-me-overlay__delta")].map((e) => e.textContent);
    expect(slot.nextElementSibling?.textContent).toBe("Ask Me Total");
    expect(shown()).toEqual([]);

    rerender(<AskMeOverlay askMe={askMe(200)} />);
    expect(shown()).toEqual(["+$100"]);
    act(() => vi.advanceTimersByTime(1000));
    rerender(<AskMeOverlay askMe={askMe(250)} />);
    expect(shown()).toEqual(["+$100", "+$50"]);

    // Each leaves on its own clock.
    act(() => vi.advanceTimersByTime(2000));
    expect(shown()).toEqual(["+$50"]);
    act(() => vi.advanceTimersByTime(1000));
    expect(shown()).toEqual([]);
  });

  it("doesn't pop up for corrections downward", () => {
    const { container, rerender } = render(<AskMeOverlay askMe={askMe(300)} />);
    rerender(<AskMeOverlay askMe={askMe(200)} />);
    expect(container.querySelector(".ask-me-overlay__delta")).toBeNull();
  });
});
