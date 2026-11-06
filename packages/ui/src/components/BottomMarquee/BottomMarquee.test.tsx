import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomMarquee } from "./BottomMarquee.js";

const items = [
  { id: "a", title: "Weekend at the lake", currentBid: 120, bidCount: 3, imageUrl: null, value: null, remaining: null },
];
const offset = (container: HTMLElement) =>
  Number(
    /translateX\((-?[\d.]+)px\)/.exec(
      (container.querySelector(".bottom-marquee__wrapper") as HTMLElement).style.transform,
    )?.[1] ?? 0,
  );

describe("BottomMarquee", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout"] });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("picks up where the last marquee with the same key stopped", () => {
    const first = render(<BottomMarquee items={items} speedPxPerFrame={2} resumeKey="test-resume" />);
    act(() => vi.advanceTimersByTime(1000));
    const stoppedAt = offset(first.container);
    expect(stoppedAt).toBeLessThan(0);
    first.unmount();

    const next = render(<BottomMarquee items={items} speedPxPerFrame={2} resumeKey="test-resume" />);
    act(() => vi.advanceTimersByTime(20));
    expect(offset(next.container)).toBeLessThan(stoppedAt);
  });

  it("starts from the first item without a key", () => {
    const first = render(<BottomMarquee items={items} speedPxPerFrame={2} />);
    act(() => vi.advanceTimersByTime(1000));
    first.unmount();
    const next = render(<BottomMarquee items={items} speedPxPerFrame={2} />);
    act(() => vi.advanceTimersByTime(20));
    expect(offset(next.container)).toBeGreaterThan(-10);
  });
});
