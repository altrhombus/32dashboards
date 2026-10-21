import { FundraiserEventSchema, type LiveStateReplicant, type SourceItem } from "@32dashboards/schema/core";
import { HUGE_TOTAL, LONG_DESCRIPTION, LONG_NAME, LONG_TITLE, worstCaseItems } from "@32dashboards/ui";

/*
 * Made-up show data for previewing layouts without an event on screen:
 * `demo` looks like a typical night, `worst` has every field at its longest,
 * so a layout can be checked against both before it goes on a TV.
 */

export type SampleKind = "demo" | "worst";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-10T12:00:00.000Z";

const demoItems: SourceItem[] = [
  ["Weekend at the lake cabin", 120, 600, 1],
  ["Chef's table dinner for six", 340, 900, 2],
  ["Signed print by a local artist", 85, 250, 0],
  ["Season tickets, two seats", 410, 800, 2],
  ["Hot air balloon ride", 150, 450, 1],
  ["Pottery class for four", 60, 200, 0],
  ["Golf foursome", 220, 400, 5],
  ["Wine tasting for ten", 300, 500, 7],
].map(([title, currentBid, value, bidCount], i) => ({
  id: `demo-${i}`,
  title: title as string,
  imageUrl: null,
  currentBid: currentBid as number,
  value: value as number,
  bidCount: bidCount as number,
  remaining: "2 hours",
}));

/** Two hours and ten minutes from now, so the sample countdown is running. */
const soon = () => new Date(Date.now() + 130 * 60_000).toISOString();

function demoEvent() {
  return FundraiserEventSchema.parse({
    id: id(100),
    name: "Spring Gala",
    causeName: "Riverside Animal Shelter",
    endDateTime: soon(),
    theme: {},
    askMe: { enabled: false, title: "Fund a kennel", message: "Every **$250** builds one new kennel.", total: 1750 },
    announcements: ["Dessert auction opens at 8", "Thank you to our volunteers!"],
    incentives: [{ id: id(101), name: "New puppy play yard", target: 15000, active: true }],
    sponsors: [{ id: id(102), name: "Northside Bakery", logoUrl: null, sortOrder: 0 }],
    milestones: [{ id: id(103), amount: 10000, label: "A month of food for every dog" }],
    bidWars: [
      { id: id(104), name: "Name the shelter cat", options: [{ id: id(105), name: "Biscuit", total: 340 }, { id: id(106), name: "Pepper", total: 280 }] },
    ],
    prizes: [{ id: id(107), name: "Weekend getaway", description: "Two nights for two", minimumDonation: 50 }],
    callToAction: "Scan the code on your table to give",
    source: { adapterId: "manual" },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function worstEvent() {
  return FundraiserEventSchema.parse({
    id: id(1),
    name: LONG_TITLE,
    causeName: LONG_TITLE,
    endDateTime: "2026-10-10T23:00:00.000Z",
    theme: {},
    askMe: { enabled: false, title: LONG_NAME, message: LONG_DESCRIPTION, total: HUGE_TOTAL },
    announcements: [LONG_TITLE, "", "Doors close at 9"],
    incentives: [
      { id: id(2), name: LONG_TITLE, target: HUGE_TOTAL, active: true },
      { id: id(3), name: "Inactive", target: 10, active: false },
    ],
    sponsors: [{ id: id(4), name: LONG_NAME, logoUrl: null, sortOrder: 0 }],
    milestones: [{ id: id(5), amount: 1000, label: LONG_DESCRIPTION.slice(0, 120) }],
    bidWars: [
      { id: id(6), name: LONG_TITLE.slice(0, 120), options: [{ id: id(7), name: LONG_NAME, total: 5 }, { id: id(8), name: "B" }] },
      { id: id(9), name: "One option only", options: [{ id: id(10), name: "A" }] },
    ],
    prizes: [{ id: id(11), name: LONG_NAME, description: LONG_DESCRIPTION, minimumDonation: 25 }],
    callToAction: LONG_TITLE.slice(0, 160),
    source: { adapterId: "manual" },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

/** Live state for a sample show. The event keeps `theme` so callers can swap in a real event's look. */
export function sampleLive(kind: SampleKind): LiveStateReplicant {
  if (kind === "worst") {
    return {
      event: worstEvent(),
      rawTotal: HUGE_TOTAL,
      adjustment: 0,
      total: HUGE_TOTAL,
      items: worstCaseItems,
      hiddenItemCount: 0,
      sourceId: "manual",
      observedAt: NOW,
    };
  }
  return {
    event: demoEvent(),
    rawTotal: 11_230,
    adjustment: 1_250,
    total: 12_480,
    items: demoItems,
    hiddenItemCount: 0,
    sourceId: "manual",
    observedAt: NOW,
  };
}
