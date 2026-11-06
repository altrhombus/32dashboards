import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ANNOUNCEMENT_LEAVE_MS, AnnouncementsList } from "./AnnouncementsList.js";

describe("AnnouncementsList", () => {
  afterEach(() => vi.useRealTimers());
  it("never turns typed HTML into markup (Markdown is sanitized)", () => {
    const malicious = 'Doors at 6 <img src="x" onerror="window.__xss = true">';
    render(<AnnouncementsList announcements={[malicious]} />);

    expect(screen.getByText(/Doors at 6/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it("renders nothing when there are no announcements", () => {
    const { container } = render(<AnnouncementsList announcements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one at a time when rotating, each in turn", () => {
    vi.useFakeTimers();
    const { container } = render(<AnnouncementsList announcements={["First", "Second"]} rotateMs={7000} />);
    const shown = () => container.querySelector(".announcements-list__slide")!.textContent;
    expect(shown()).toBe("First");
    expect(container.querySelectorAll(".announcements-list__dots span")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(7000 + ANNOUNCEMENT_LEAVE_MS));
    expect(shown()).toBe("Second");
  });
});
