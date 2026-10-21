import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskMeOverlay } from "./AskMeOverlay.js";

const askMe = (total: number) => ({ enabled: true, title: "Fund a kennel", message: "Raise your paddle", total });

describe("AskMeOverlay", () => {
  afterEach(() => vi.useRealTimers());

  it("shows what was added in its own line above the total, adding up quick taps", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AskMeOverlay askMe={askMe(100)} />);
    const slot = container.querySelector(".ask-me-overlay__delta-slot")!;
    expect(slot.nextElementSibling?.textContent).toBe("Ask Me Total");
    expect(slot.textContent).toBe("");

    rerender(<AskMeOverlay askMe={askMe(200)} />);
    expect(slot.textContent).toBe("+$100");
    act(() => vi.advanceTimersByTime(1000));
    rerender(<AskMeOverlay askMe={askMe(300)} />);
    expect(slot.textContent).toBe("+$200");

    act(() => vi.advanceTimersByTime(3000));
    expect(slot.textContent).toBe("");
  });

  it("doesn't pop up for corrections downward", () => {
    const { container, rerender } = render(<AskMeOverlay askMe={askMe(300)} />);
    rerender(<AskMeOverlay askMe={askMe(200)} />);
    expect(container.querySelector(".ask-me-overlay__delta")).toBeNull();
  });
});
