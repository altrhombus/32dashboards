import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BidWar, Prize } from "@32dashboards/schema/core";
import { BidWarCard } from "../components/BidWarCard/BidWarCard.js";
import { BottomMarquee } from "../components/BottomMarquee/BottomMarquee.js";
import { CallToActionBanner } from "../components/CallToActionBanner/CallToActionBanner.js";
import { FeaturedItemsGrid } from "../components/FeaturedItemsGrid/FeaturedItemsGrid.js";
import { IncentiveTracker } from "../components/IncentiveTracker/IncentiveTracker.js";
import { MilestoneCelebration } from "../components/MilestoneCelebration/MilestoneCelebration.js";
import { MomentToast } from "../components/MomentToast/MomentToast.js";
import { PrizeCard } from "../components/PrizeCard/PrizeCard.js";
import { TotalRaisedCounter } from "../components/TotalRaisedCounter/TotalRaisedCounter.js";
import { HUGE_TOTAL, LONG_DESCRIPTION, LONG_NAME, LONG_TITLE, worstCaseItems } from "../fixtures/worstCase.js";

/*
 * Display rules, checked against worst-case input:
 *  - long text is clamped (a clamp-* class) and stays readable in `title`
 *  - every amount uses tabular figures (`num`) and whole dollars (no cents)
 * jsdom can't measure layout, so overflow itself is checked visually; these
 * tests keep the structure that makes the CSS work from regressing.
 */

const ID = "11111111-1111-4111-8111-111111111111";

function expectClamped(text: string) {
  const el = screen.getByTitle(text);
  expect(el.className).toMatch(/\bclamp-[12]\b/);
}

function expectAmountsTabularAndWhole(container: HTMLElement) {
  for (const el of container.querySelectorAll(".num")) {
    expect(el.textContent).not.toMatch(/\.\d{2}\b/);
  }
  const amounts = [...container.querySelectorAll("*")].filter(
    (el) => el.children.length === 0 && /\$\d/.test(el.textContent ?? ""),
  );
  for (const el of amounts) expect(el.closest(".num")).not.toBeNull();
}

describe("worst-case strings and numbers", () => {
  it("TotalRaisedCounter: eight-digit total in whole dollars, long cause clamped", () => {
    const { container } = render(<TotalRaisedCounter total={HUGE_TOTAL} causeName={LONG_TITLE} variant="hero" />);
    expect(screen.getByText("$99,999,999")).toHaveClass("num");
    expectClamped(LONG_TITLE);
    expectAmountsTabularAndWhole(container);
  });

  it("FeaturedItemsGrid: long, empty, and missing fields", () => {
    const { container } = render(<FeaturedItemsGrid items={worstCaseItems} />);
    expectClamped(LONG_TITLE);
    expect(screen.getByText("Untitled item")).toBeInTheDocument();
    expect(screen.getByText("9999 bids")).toHaveClass("num");
    expectAmountsTabularAndWhole(container);
  });

  it("BottomMarquee: renders every item with tabular prices", () => {
    const { container } = render(<BottomMarquee items={worstCaseItems} />);
    expect(screen.getAllByText(LONG_NAME)).toHaveLength(2);
    expectAmountsTabularAndWhole(container);
  });

  it("IncentiveTracker: long name clamped", () => {
    const incentive = { id: ID, name: LONG_TITLE, target: HUGE_TOTAL, active: true, displayNow: false, displayUntilMet: false };
    const { container } = render(<IncentiveTracker incentive={incentive} totalRaised={HUGE_TOTAL / 2} />);
    expectClamped(LONG_TITLE);
    expectAmountsTabularAndWhole(container);
  });

  it("BidWarCard: twelve 25-character options, a clear leader", () => {
    const bidWar: BidWar = {
      id: ID,
      name: LONG_TITLE.slice(0, 120),
      description: LONG_DESCRIPTION,
      active: true,
      options: Array.from({ length: 12 }, (_, i) => ({ id: `${ID.slice(0, -2)}${String(i).padStart(2, "0")}`, name: LONG_NAME, total: i * 1000.75 })),
    };
    const { container } = render(<BidWarCard bidWar={bidWar} />);
    expect(container.querySelectorAll(".bid-war-card__option--leader")).toHaveLength(1);
    expectClamped(LONG_TITLE.slice(0, 120));
    expectAmountsTabularAndWhole(container);
  });

  it("BidWarCard: no leader on a tie or when nothing's raised", () => {
    const tie: BidWar = {
      id: ID,
      name: "Tie",
      description: "",
      active: true,
      options: [
        { id: `${ID.slice(0, -1)}2`, name: "A", total: 5 },
        { id: `${ID.slice(0, -1)}3`, name: "B", total: 5 },
      ],
    };
    const { container, rerender } = render(<BidWarCard bidWar={tie} />);
    expect(container.querySelector(".bid-war-card__option--leader")).toBeNull();
    rerender(<BidWarCard bidWar={{ ...tie, options: tie.options.map((o) => ({ ...o, total: 0 })) }} />);
    expect(container.querySelector(".bid-war-card__option--leader")).toBeNull();
  });

  it("PrizeCard: long name and description clamped", () => {
    const prize: Prize = { id: ID, name: LONG_TITLE.slice(0, 120), description: LONG_DESCRIPTION, minimumDonation: 25.5, active: true };
    const { container } = render(<PrizeCard prize={prize} />);
    expectClamped(LONG_TITLE.slice(0, 120));
    expectClamped(LONG_DESCRIPTION);
    expect(screen.getByText("Give $26+ to enter")).toHaveClass("num");
    expectAmountsTabularAndWhole(container);
  });

  it("CallToActionBanner: long text clamped, empty renders nothing", () => {
    const { container, rerender } = render(<CallToActionBanner text={LONG_TITLE.slice(0, 160)} />);
    expectClamped(LONG_TITLE.slice(0, 160));
    rerender(<CallToActionBanner text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("MomentToast and MilestoneCelebration: long titles clamped, amounts tabular", () => {
    const at = "2026-10-10T12:00:00.000Z";
    const { container } = render(
      <>
        <MomentToast moment={{ kind: "new-bid", id: ID, eventId: ID, at, itemId: "x", itemTitle: LONG_TITLE, amount: 9_999_999.5, bidCount: 1 }} />
        <MomentToast moment={{ kind: "total-increase", id: ID, eventId: ID, at, delta: 25.25, total: HUGE_TOTAL }} />
        <MilestoneCelebration heading="Milestone reached!" amount={HUGE_TOTAL} detail={LONG_DESCRIPTION} />
      </>,
    );
    expectClamped(LONG_TITLE);
    expectClamped(LONG_DESCRIPTION);
    expect(screen.getByText("+$25")).toHaveClass("num");
    expectAmountsTabularAndWhole(container);
  });
});
