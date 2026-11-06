import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentDonations, timeAgo } from "./RecentDonations.js";

const base = { eventId: "00000000-0000-4000-8000-000000000001", at: new Date().toISOString() };

describe("RecentDonations", () => {
  it("says what it's for before the first bid", () => {
    const { container } = render(<RecentDonations moments={[]} />);
    expect(container.textContent).toContain("New bids will show here");
  });

  it("shows what over how much and when, newest first", () => {
    const { container } = render(
      <RecentDonations
        moments={[
          { ...base, kind: "total-increase", id: "b", delta: 25, total: 0 },
          { ...base, kind: "new-bid", id: "a", itemId: "1", itemTitle: "Cookies", amount: 45, bidCount: 4, newBids: 3 },
        ]}
      />,
    );
    const chips = [...container.querySelectorAll(".recent-donations__chip")].map((c) => [
      c.querySelector(".recent-donations__title")!.textContent,
      [...c.querySelector(".recent-donations__meta")!.children].map((e) => e.textContent),
    ]);
    expect(chips).toEqual([
      ["Thank you!", ["+$25", "just now"]],
      ["Cookies", ["$45", "3 bids", "just now"]],
    ]);
    expect(container.querySelector(".recent-donations__label")?.textContent).toBe("Bids");
  });

  it("says roughly how long ago", () => {
    const now = Date.parse("2026-11-07T21:00:00Z");
    expect(timeAgo("2026-11-07T20:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-07T21:00:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-07T20:56:00Z", now)).toBe("4 min ago");
    expect(timeAgo("2026-11-07T19:30:00Z", now)).toBe("1 hr ago");
  });
});
