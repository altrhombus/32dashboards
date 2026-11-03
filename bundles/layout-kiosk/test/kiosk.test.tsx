import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutRenderer, validateLayout } from "@32dashboards/layout-engine";
import { SCENE_IDS, type LiveStateReplicant, type SceneReplicant } from "@32dashboards/schema/core";
import { LONG_DESCRIPTION, LONG_TITLE, worstCaseItems } from "@32dashboards/ui";
import type { KioskData } from "../src/data.js";
import { kioskCatalog } from "../src/catalog.js";
import { builtInLayouts, templates } from "../src/layouts.js";
import { checkLayout } from "../src/library.js";
import { kioskRegistry } from "../src/registry.js";
import { sampleLive } from "../src/samples.js";
import { buildSegments, selectFeaturedItems } from "../src/segments.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-10T12:00:00.000Z";

/** Every field at its worst case. */
const live: LiveStateReplicant = sampleLive("worst");
const worstEvent = live.event!;

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

  it.each(templates.filter((t) => t.blocks.blocks.length > 0).map((t) => [t.name, t] as const))(
    "template %s has no errors or warnings",
    (_name, template) => {
      expect(checkLayout(template.blocks, "main")).toEqual({ errors: [], warnings: [] });
    },
  );

  it("fills built-in blocks' settings with the catalog's defaults", () => {
    const featured = builtInLayouts.main.blocks.blocks.find((b) => b.component === "featuredItems");
    expect(featured?.settings).toEqual({ title: "Featured items", size: 6 });
    expect(builtInLayouts.main.layout.slots.countdown?.options).toEqual({ title: "Time left" });
  });

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
      roundWrap: null,
      toasts: [
        {
          kind: "new-bid",
          id: id(20),
          eventId: id(1),
          at: NOW,
          itemId: "x",
          itemTitle: LONG_TITLE,
          amount: 99,
          bidCount: 9,
        },
      ],
    };
    const { container } = render(
      <LayoutRenderer layout={builtInLayouts[sceneId].layout} registry={kioskRegistry} data={data} fit="none" />,
    );
    expect(container.querySelector("[data-slot-error]")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    if (sceneId === "main" || sceneId === "intermission") {
      expect(screen.getAllByText("$99,999,999").length).toBeGreaterThan(0);
    }
    errors.mockRestore();
  });

  it("wraps up a finished Ask Me round on the Ask Me screen", () => {
    const data: KioskData = {
      live,
      scene: scene("askMe"),
      infoBar: { type: "empty" },
      toasts: [],
      roundWrap: {
        kind: "askme-round",
        id: id(40),
        eventId: id(1),
        at: NOW,
        amount: 800,
        total: 5000,
        title: "A transport van",
        number: 3,
        count: 3,
        raisedTonight: 2050,
      },
    };
    const { container } = render(
      <LayoutRenderer layout={builtInLayouts.askMe.layout} registry={kioskRegistry} data={data} fit="none" />,
    );
    const wrap = container.querySelector(".askme-wrap")?.textContent ?? "";
    expect(wrap).toContain("Ask Me 3 of 3");
    expect(wrap).toContain("A transport van");
    expect(wrap).toContain("$800");
    expect(wrap).toContain("Ask Me raised $2,050 tonight");
  });

  it("shows the planned round on now, then tonight's thanks once all are done", () => {
    const rounds = [
      { id: id(50), title: "Fund a kennel", message: "Kennels", raised: 1250 },
      { id: id(51), title: "Vet care", message: "Every **$50** pays for a checkup.", raised: null },
    ];
    const view = (askMeCurrent: number) => {
      const event = { ...worstEvent, askMeRounds: rounds, askMeCurrent, askMeRaised: 1250 };
      const data: KioskData = {
        live: { ...live, event },
        scene: scene("askMe"),
        infoBar: { type: "empty" },
        toasts: [],
        roundWrap: null,
      };
      const { container, unmount } = render(
        <LayoutRenderer layout={builtInLayouts.askMe.layout} registry={kioskRegistry} data={data} fit="none" />,
      );
      const text = container.textContent ?? "";
      unmount();
      return text;
    };
    expect(view(1)).toContain("Ask Me 2 of 2");
    expect(view(1)).toContain("Vet care");
    expect(view(2)).toContain("Thank you!");
    expect(view(2)).toContain("$1,250");
  });

  it("shows a milestone in the info bar and as a full-screen spotlight", () => {
    const data: KioskData = {
      live,
      scene: scene("main"),
      infoBar: {
        type: "celebration",
        moment: {
          kind: "milestone",
          id: id(30),
          eventId: id(1),
          at: NOW,
          milestoneId: id(5),
          amount: 1000,
          label: "First grand",
        },
      },
      toasts: [],
      roundWrap: null,
    };
    const { container } = render(
      <LayoutRenderer layout={builtInLayouts.main.layout} registry={kioskRegistry} data={data} fit="none" />,
    );
    expect(screen.getByText("Milestone reached!")).toBeInTheDocument();
    expect(container.querySelector(".milestone-spotlight")?.textContent).toContain("First grand");
    expect(screen.getAllByText("First grand")).toHaveLength(2);
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
    expect(withIncentives([{ ...base, id: id(40), target: 100, displayUntilMet: true }], 50)).toBe(
      `incentive:${id(40)}`,
    );
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
  const item = (id: string, value: number | null, bidCount: number) => ({
    id,
    title: id,
    imageUrl: null,
    currentBid: 10,
    value,
    bidCount,
    remaining: null,
  });

  it("features the deals when there are enough to fill the grid", () => {
    const items = [item("a", 100, 0), item("b", 100, 1), item("c", 100, 9), item("d", 100, 2)];
    expect(selectFeaturedItems(items, 3).map((i) => i.id)).toEqual(["a", "b", "d"]);
  });

  it("tops up a short list of deals with the most-bid items, so no slot is empty", () => {
    const items = [item("deal", 100, 1), item("quiet", null, 0), item("busy", null, 12), item("warm", 50, 5)];
    expect(selectFeaturedItems(items, 3).map((i) => i.id)).toEqual(["deal", "busy", "warm"]);
    expect(selectFeaturedItems(worstCaseItems).map((i) => i.id)).toEqual(["empty", "long", "name"]);
  });
});
