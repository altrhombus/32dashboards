import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentDonations } from "./RecentDonations.js";

const base = { eventId: "00000000-0000-4000-8000-000000000001", at: "2026-11-07T20:00:00.000Z" };

describe("RecentDonations", () => {
  it("lists bids and donations newest first, with how many bids came in", () => {
    const { container } = render(
      <RecentDonations
        label="Latest bids"
        moments={[
          { ...base, kind: "total-increase", id: "b", delta: 25, total: 0 },
          { ...base, kind: "new-bid", id: "a", itemId: "1", itemTitle: "Cookies", amount: 45, bidCount: 4, newBids: 3 },
        ]}
      />,
    );
    const chips = [...container.querySelectorAll(".recent-donations__chip")].map((c) => c.textContent);
    expect(chips).toEqual(["+$25Thank you!", "Cookies$45×3"]);
    expect(container.textContent).toContain("Latest bids");
  });
});
