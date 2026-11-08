import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutRenderer, validateLayout } from "@32dashboards/layout-engine";
import { SCENE_IDS, type LiveStateReplicant, type SceneReplicant } from "@32dashboards/schema/core";
import { LONG_DESCRIPTION, LONG_TITLE, worstCaseItems } from "@32dashboards/ui";
import type { KioskData } from "../src/data.js";
import { kioskCatalog } from "../src/catalog.js";
import { builtInLayouts, templates } from "../src/layouts.js";
import { checkLayout } from "../src/library.js";
import { kioskRegistry, usesSpotlight } from "../src/registry.js";
import { sampleLive } from "../src/samples.js";
import { buildSegments, selectFeaturedItems, selectNoBidItems } from "../src/segments.js";

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
    expect(featured?.settings).toEqual({
      title: "Featured items",
      size: 6,
      show: "both",
      featuredSeconds: 30,
      noBidsSeconds: 20,
    });
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
      recent: [],
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
          newBids: 3,
          purchase: false,
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
      recent: [],
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
        recent: [],
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
      recent: [],
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
    const custom = {
      ...live,
      event: { ...worstEvent, infoBar: { segments: ["prizes" as const], segmentSeconds: 5, seconds: {} } },
    };
    expect(buildSegments(custom).segments.map((s) => [s.key, s.durationMs])).toEqual([[`prize:${id(11)}`, 5000]]);
  });

  it("gives Latest bids its turn even before the first bid", () => {
    const withRecent = {
      ...live,
      event: { ...worstEvent, infoBar: { segments: ["recent" as const], segmentSeconds: 10, seconds: {} } },
    };
    expect(buildSegments(withRecent).segments.map((s) => [s.key, s.durationMs])).toEqual([["recent", 20_000]]);
  });

  it("gives each kind its own time when one is set", () => {
    const timed = {
      ...live,
      event: {
        ...worstEvent,
        infoBar: { segments: ["items" as const, "prizes" as const], segmentSeconds: 10, seconds: { items: 54 } },
      },
    };
    expect(buildSegments(timed).segments.map((s) => [s.key, s.durationMs])).toEqual([
      ["items", 54_000],
      [`prize:${id(11)}`, 10_000],
    ]);
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

describe("the No bids yet scene", () => {
  it("picks auction items without a bid, not Buy Now items or ones already bid on", () => {
    const item = (id: string, bidCount: number | null, available?: number | null) => ({
      id,
      title: id,
      imageUrl: null,
      currentBid: 10,
      value: null,
      bidCount,
      remaining: null,
      available,
    });
    const picked = selectNoBidItems([item("open", 0), item("bid", 2), item("buy-now", null, 4), item("sold", 0, 0)]);
    expect(picked.map((i) => i.id)).toEqual(["open"]);
  });

  it("offers a QR code on Welcome when the call to action has an address, without repeating it", () => {
    const demo = sampleLive("demo");
    const event = { ...demo.event!, callToAction: "Bid at https://www.32auctions.com/SpringGala" };
    const data: KioskData = {
      live: { ...demo, event },
      scene: scene("welcome"),
      infoBar: { type: "empty" },
      roundWrap: null,
      recent: [],
      toasts: [],
    };
    render(<LayoutRenderer layout={builtInLayouts.welcome.layout} registry={kioskRegistry} data={data} fit="none" />);
    expect(screen.getByRole("img", { name: "QR code to bid or give" })).toBeInTheDocument();
    expect(screen.queryByText(/Bid at/)).toBeNull();
  });

  it("shows the address the short way in the info bar", () => {
    const demo = sampleLive("demo");
    const event = { ...demo.event!, callToAction: "Bid at https://www.32auctions.com/SpringGala" };
    const cta = buildSegments({ ...demo, event }).segments.find((s) => s.content.kind === "callToAction");
    expect(cta?.content).toEqual({ kind: "callToAction", text: "Bid at 32auctions.com/SpringGala" });
  });
});

describe("milestones over a scene that shouldn't be covered", () => {
  it.each(["askMe", "celebration"] as const)("%s shows a banner, not the spotlight", (sceneId) => {
    const moment = {
      kind: "last-call" as const,
      id: id(30),
      eventId: id(1),
      at: NOW,
      minutesLeft: 5,
    };
    const data: KioskData = {
      live,
      scene: scene(sceneId),
      infoBar: { type: "celebration", moment },
      roundWrap: null,
      recent: [],
      toasts: [],
    };
    const { container } = render(
      <LayoutRenderer layout={builtInLayouts[sceneId].layout} registry={kioskRegistry} data={data} fit="none" />,
    );
    expect(container.querySelector(".kiosk-banner")).not.toBeNull();
    expect(screen.getByText("5 minutes left")).toBeInTheDocument();
    expect(builtInLayouts[sceneId].blocks.overlays.map((o) => o.component)).not.toContain("milestoneSpotlight");
  });
});

describe("how milestones are celebrated", () => {
  const milestone = (label: string) => ({
    kind: "milestone" as const,
    id: id(40),
    eventId: id(1),
    at: NOW,
    milestoneId: id(41),
    amount: 5000,
    label,
  });
  const goal = {
    kind: "incentive-met" as const,
    id: id(42),
    eventId: id(1),
    at: NOW,
    incentiveId: id(43),
    name: "New van",
    target: 5000,
  };
  const lastCall = { kind: "last-call" as const, id: id(44), eventId: id(1), at: NOW, minutesLeft: 5 };
  const withStyle = (milestoneStyle: NonNullable<LiveStateReplicant["event"]>["milestoneStyle"]) => {
    const demo = sampleLive("demo");
    return { ...demo, event: { ...demo.event!, milestoneStyle } };
  };

  it.each([
    ["spotlight", "", true],
    ["spotlight", "A new van", true],
    ["infoBar", "", false],
    ["infoBar", "A new van", false],
    ["named", "", false],
    ["named", "A new van", true],
  ] as const)("%s, label %j: full screen is %s", (style, label, expected) => {
    expect(usesSpotlight({ live: withStyle(style) }, milestone(label))).toBe(expected);
  });

  it("treats a goal as labeled, and always gives last calls the screen", () => {
    expect(usesSpotlight({ live: withStyle("named") }, goal)).toBe(true);
    expect(usesSpotlight({ live: withStyle("infoBar") }, goal)).toBe(false);
    expect(usesSpotlight({ live: withStyle("infoBar") }, lastCall)).toBe(true);
  });

  it("never misses one: a layout without an info bar gets the full screen", () => {
    expect(usesSpotlight({ live: withStyle("infoBar"), hasInfoBar: false }, milestone(""))).toBe(true);
  });

  const renderMain = (live: LiveStateReplicant, moment: ReturnType<typeof milestone>) =>
    render(
      <LayoutRenderer
        layout={builtInLayouts.main.layout}
        registry={kioskRegistry}
        data={{
          live,
          scene: scene("main"),
          infoBar: { type: "celebration", moment },
          roundWrap: null,
          recent: [],
          toasts: [],
          hasInfoBar: true,
        }}
        fit="none"
      />,
    ).container;

  it("puts on the show in the bar when nothing covers the screen", () => {
    const container = renderMain(withStyle("named"), milestone(""));
    expect(container.querySelector(".kiosk-info-bar--starring")).not.toBeNull();
    expect(container.querySelector(".milestone-spotlight")).toBeNull();
  });

  it("keeps the bar quiet under the full screen", () => {
    const container = renderMain(withStyle("named"), milestone("A new van"));
    expect(container.querySelector(".kiosk-info-bar--starring")).toBeNull();
    expect(container.querySelector(".milestone-spotlight")).not.toBeNull();
  });
});

describe("the items block", () => {
  const item = (n: number, bidCount: number): LiveStateReplicant["items"][number] => ({
    id: `item-${n}`,
    title: `Item ${n}`,
    imageUrl: null,
    currentBid: 10,
    value: 100,
    bidCount,
    remaining: null,
    url: `https://example.test/${n}`,
  });
  const block = builtInLayouts.main.blocks.blocks.find((b) => b.component === "featuredItems")!;
  const FeaturedBlock = kioskRegistry.featuredItems!;

  function renderBlock(items: LiveStateReplicant["items"], settings: Record<string, unknown> = {}) {
    const data: KioskData = {
      live: { ...sampleLive("demo"), items },
      scene: scene("main"),
      infoBar: { type: "empty" },
      roundWrap: null,
      recent: [],
      toasts: [],
    };
    const props = FeaturedBlock.select(data, { variant: "grid", options: { ...block.settings, ...settings } })!;
    const Component = FeaturedBlock.component;
    return render(<Component {...props} />).container;
  }
  const pane = (container: HTMLElement, selector: string) =>
    container.querySelector(selector)?.closest<HTMLElement>(".kiosk-items") ?? null;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("takes turns: featured items, then no bids, then back", () => {
    const container = renderBlock([item(1, 1), item(2, 0)], { featuredSeconds: 30, noBidsSeconds: 20 });
    const featured = pane(container, ".featured-items-grid")!;
    const noBids = pane(container, ".no-bid-spotlight")!;
    expect([featured.hidden, noBids.hidden]).toEqual([false, true]);
    act(() => void vi.advanceTimersByTime(30_000));
    expect([featured.hidden, noBids.hidden]).toEqual([true, false]);
    act(() => void vi.advanceTimersByTime(20_000));
    expect([featured.hidden, noBids.hidden]).toEqual([false, true]);
  });

  it("picks up where each left off, rather than starting again", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item(n, 0));
    const container = renderBlock(items, { featuredSeconds: 10, noBidsSeconds: 10, size: 1 });
    const shown = () => [...container.querySelectorAll(".no-bid-spotlight__title")].map((el) => el.textContent);
    expect(shown()).toEqual(["Item 1", "Item 2"]);
    act(() => void vi.advanceTimersByTime(10_000));
    act(() => void vi.advanceTimersByTime(10_000));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(shown()).toEqual(["Item 3", "Item 4"]);
  });

  it("shows just one when a layout says so", () => {
    expect(pane(renderBlock([item(1, 1), item(2, 0)], { show: "featured" }), ".no-bid-spotlight")).toBeNull();
    expect(pane(renderBlock([item(1, 1), item(2, 0)], { show: "noBids" }), ".featured-items-grid")).toBeNull();
  });

  it("stays on featured items once every item has a bid", () => {
    const container = renderBlock([item(1, 1)]);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(pane(container, ".featured-items-grid")!.hidden).toBe(false);
  });

  it("takes turns in a layout saved before the setting existed", () => {
    const data: KioskData = {
      live: { ...sampleLive("demo"), items: [item(1, 1), item(2, 0)] },
      scene: scene("main"),
      infoBar: { type: "empty" },
      roundWrap: null,
      recent: [],
      toasts: [],
    };
    expect(FeaturedBlock.select(data, { variant: "grid", options: { title: "Items", size: 6 } })).toMatchObject({
      show: "both",
      featuredMs: 30_000,
      noBidsMs: 20_000,
    });
  });
});

describe("the Live auction scene", () => {
  const renderScene = (live: LiveStateReplicant, sold: KioskData["sold"] = null) =>
    render(
      <LayoutRenderer
        layout={builtInLayouts.liveAuction.layout}
        registry={kioskRegistry}
        data={{
          live,
          scene: scene("liveAuction"),
          infoBar: { type: "empty" },
          roundWrap: null,
          sold,
          recent: [],
          toasts: [],
        }}
        fit="none"
      />,
    ).container;
  const demo = sampleLive("demo");

  it("shows the item, the running bid, and what's next", () => {
    renderScene(demo);
    expect(screen.getByText("Week at the lake house")).toBeInTheDocument();
    expect(screen.getByText("Current bid")).toBeInTheDocument();
    expect(screen.getByText("$850")).toBeInTheDocument();
    expect(screen.getByText("Up next: Chef's dinner for ten")).toBeInTheDocument();
  });

  it("leaves the bid off when nobody's keeping up with it", () => {
    renderScene({ ...demo, event: { ...demo.event!, liveShowBid: false } });
    expect(screen.getByText("Week at the lake house")).toBeInTheDocument();
    expect(screen.queryByText("Current bid")).toBeNull();
  });

  it("holds the room with a title and the total when there are no items", () => {
    renderScene({ ...demo, event: { ...demo.event!, liveLots: [] } });
    expect(screen.getByText("Live auction")).toBeInTheDocument();
    expect(screen.getByText("$12,480")).toBeInTheDocument();
  });

  it("says thank you, with what it raised, after the last item", () => {
    const event = { ...demo.event!, liveCurrent: demo.event!.liveLots.length };
    renderScene({ ...demo, event, liveRaised: 3100 });
    expect(screen.getByText("Thank you!")).toBeInTheDocument();
    expect(screen.getByText("$3,100")).toBeInTheDocument();
  });

  it("stamps SOLD with the price and paddle", () => {
    renderScene(demo, {
      kind: "live-sold",
      id: id(50),
      eventId: id(1),
      at: NOW,
      lotId: id(51),
      title: "Week at the lake house",
      amount: 2200,
      paddle: "42",
      imageUrl: null,
    });
    expect(screen.getByText("Sold!")).toBeInTheDocument();
    expect(screen.getByText("$2,200")).toBeInTheDocument();
    expect(screen.getByText("Paddle 42")).toBeInTheDocument();
  });
});

describe("a live item's description", () => {
  const withDescription = (description: string) => {
    const demo = sampleLive("demo");
    const [first, ...rest] = demo.event!.liveLots;
    return { ...demo, event: { ...demo.event!, liveLots: [{ ...first!, description }, ...rest] } };
  };
  const renderIt = (description: string) =>
    render(
      <LayoutRenderer
        layout={builtInLayouts.liveAuction.layout}
        registry={kioskRegistry}
        data={{
          live: withDescription(description),
          scene: scene("liveAuction"),
          infoBar: { type: "empty" },
          roundWrap: null,
          recent: [],
          toasts: [],
        }}
        fit="none"
      />,
    ).container;

  it("understands Markdown", () => {
    const container = renderIt("Seven nights, **boat included**.\n\n- Sleeps eight\n- On the water");
    expect(container.querySelector(".live-stage__description strong")).toHaveTextContent("boat included");
    expect(container.querySelectorAll(".live-stage__description li")).toHaveLength(2);
  });

  it("can't inject anything into the TV", () => {
    const container = renderIt('Nice <img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(container.querySelector(".live-stage__description img, .live-stage__description script")).toBeNull();
  });
});
