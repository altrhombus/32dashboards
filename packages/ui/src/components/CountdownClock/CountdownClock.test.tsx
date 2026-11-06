import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { CountdownClock } from "./CountdownClock.js";

describe("CountdownClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders placeholder dashes when there is no end date", () => {
    render(<CountdownClock endDateTime={null} />);
    expect(screen.getByText("--:--:--")).toBeInTheDocument();
  });

  it("renders the remaining time formatted as HH:MM:SS", () => {
    const endDateTime = new Date("2026-01-01T01:02:03.000Z").toISOString();
    render(<CountdownClock endDateTime={endDateTime} />);
    expect(screen.getByText("01:02:03")).toBeInTheDocument();
  });

  it("calls onExpire exactly once when the countdown reaches zero", () => {
    const onExpire = vi.fn();
    const endDateTime = new Date("2026-01-01T00:00:01.000Z").toISOString();
    render(<CountdownClock endDateTime={endDateTime} onExpire={onExpire} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("calls attention to itself near the end, and says when it's over", () => {
    const endDateTime = new Date("2026-01-01T00:09:00.000Z").toISOString();
    const { container } = render(
      <CountdownClock endDateTime={endDateTime} urgentMs={10 * 60_000} endedLabel="Bidding closed" />,
    );
    expect(container.querySelector(".countdown-clock--soon")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(8.5 * 60_000);
    });
    expect(container.querySelector(".countdown-clock--final")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Bidding closed")).toBeInTheDocument();
  });

  it("stays calm without urgentMs", () => {
    const endDateTime = new Date("2026-01-01T00:00:30.000Z").toISOString();
    const { container } = render(<CountdownClock endDateTime={endDateTime} />);
    expect(container.querySelector(".countdown-clock--final, .countdown-clock--soon")).toBeNull();
  });
});
