import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutRenderer, validateLayout } from "@32dashboards/layout-engine";
import {
  FundraiserEventSchema,
  SCENE_IDS,
  type LiveStateReplicant,
  type SceneReplicant,
} from "@32dashboards/schema/core";
import { HUGE_TOTAL, LONG_DESCRIPTION, LONG_NAME, LONG_TITLE, worstCaseItems } from "@32dashboards/ui";
import type { KioskData } from "../src/data.js";
import { kioskCatalog } from "../src/catalog.js";
import { builtInLayouts } from "../src/layouts.js";
import { checkLayout } from "../src/library.js";
import { kioskRegistry } from "../src/registry.js";
import { buildSegments, selectFeaturedItems } from "../src/segments.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-10T12:00:00.000Z";

/** An event with every field at its worst case. */
const worstEvent = FundraiserEventSchema.parse({
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

const live: LiveStateReplicant = {
  event: worstEvent,
  rawTotal: HUGE_TOTAL,
  adjustment: 0,
  total: HUGE_TOTAL,
  items: worstCaseItems,
  hiddenItemCount: 0,
  sourceId: "manual",
  observedAt: NOW,
};

const scene = (sceneId: SceneReplicant["id"]): SceneReplicant => ({
  id: sceneId,
  countdownTo: "2026-10-10T13:00:00.000Z",
  message: LONG_DESCRIPTION.slice(0, 160),
  changedAt: NOW,
});

describe("kiosk layouts", () => {
  it.each(Object.values(builtInLayouts).map((b) => [b.view, b] as const))(
    "built-in %s layout is valid for the registry and the catalog, with no warnings",
    (view, builtIn) => {
      expect(validateLayout(builtIn.layout, kioskRegistry)).toEqual([]);
      expect(checkLayout(builtIn.blocks, view)).toEqual({ errors: [], warnings: [] });
    },
  );

  it("has a layout for every scene", () => {
    for (const sceneId of SCENE_IDS) expect(builtInLayouts[sceneId]).toBeDefined();
  });

  it("catalogs exactly the registry's components and sizes", () => {
    expect(Object.keys(kioskCatalog).sort()).toEqual(Object.keys(kioskRegistry).sort());
    for (const [name, entry] of Object.entries(kioskRegistry)) {
      expect(Object.keys(kioskCatalog[name]!.variants), name).toEqual([...entry.variants]);
    }
  });

  it.each(SCENE_IDS)("renders the %s scene with worst-case data without a failed slot", (sceneId) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const plan = buildSegments(live);
    const data: KioskData = {
      live,
      scene: scene(sceneId),
      infoBar: { type: "segment", segment: plan.segments[0]! },
      toasts: [{ kind: "new-bid", id: id(20), eventId: id(1), at: NOW, itemId: "x", itemTitle: LONG_TITLE, amount: 99, bidCount: 9 }],
    };
    const { container } = render(<LayoutRenderer layout={builtInLayouts[sceneId].layout} registry={kioskRegistry} data={data} fit="none" />);
    expect(container.querySelector("[data-slot-error]")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    if (sceneId === "main" || sceneId === "intermission") {
      expect(screen.getAllByText("$99,999,999").length).toBeGreaterThan(0);
    }
    errors.mockRestore();
  });

  it("shows a milestone celebration in the info bar", () => {
    const data: KioskData = {
      live,
      scene: scene("main"),
      infoBar: { type: "celebration", moment: { kind: "milestone", id: id(30), eventId: id(1), at: NOW, milestoneId: id(5), amount: 1000, label: "First grand" } },
      toasts: [],
    };
    render(<LayoutRenderer layout={builtInLayouts.main.layout} registry={kioskRegistry} data={data} fit="none" />);
    expect(screen.getByText("Milestone reached!")).toBeInTheDocument();
    expect(screen.getByText("First grand")).toBeInTheDocument();
  });
});

describe("buildSegments", () => {
  it("follows the configured order and skips what can't be shown", () => {
    const { segments } = buildSegments(live);
    expect(segments.map((s) => s.key.split(":")[0])).toEqual([
      "items",
      "incentive",
      "bidWar",
      "prize",
      "callToAction",
      "announcement",
      "announcement",
      "sponsor",
    ]);
    expect(segments.find((s) => s.key === "items")?.durationMs).toBe(24_000);
  });

  it("respects a custom segment list", () => {
    const custom = { ...live, event: { ...worstEvent, infoBar: { segments: ["prizes" as const], segmentSeconds: 5 } } };
    expect(buildSegments(custom).segments.map((s) => [s.key, s.durationMs])).toEqual([[`prize:${id(11)}`, 5000]]);
  });

  it("pins an incentive shown now, else one shown until met", () => {
    const withIncentives = (incentives: typeof worstEvent.incentives, total = 0) =>
      buildSegments({ ...live, total, event: { ...worstEvent, incentives } }).pinned?.key ?? null;
    const base = { name: "X", active: true, displayNow: false, displayUntilMet: false };
    expect(withIncentives([{ ...base, id: id(40), target: 100 }])).toBeNull();
    expect(withIncentives([{ ...base, id: id(40), target: 100, displayUntilMet: true }], 50)).toBe(`incentive:${id(40)}`);
    expect(withIncentives([{ ...base, id: id(40), target: 100, displayUntilMet: true }], 150)).toBeNull();
    expect(
      withIncentives([
        { ...base, id: id(40), target: 100, displayUntilMet: true },
        { ...base, id: id(41), target: 100, displayNow: true },
      ]),
    ).toBe(`incentive:${id(41)}`);
  });

  it("is empty with no event", () => {
    expect(buildSegments({ ...live, event: null })).toEqual({ segments: [], pinned: null });
  });
});

describe("selectFeaturedItems", () => {
  it("prefers valued items with few bids, falling back to all", () => {
    expect(selectFeaturedItems(worstCaseItems).map((i) => i.id)).toEqual(["empty"]);
    expect(selectFeaturedItems(worstCaseItems.filter((i) => i.id === "name")).map((i) => i.id)).toEqual(["name"]);
  });
});
