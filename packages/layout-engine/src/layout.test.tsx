import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutDefinitionSchema, LayoutRenderer, defineComponent, validateLayout, type Registry } from "./index.js";

interface Data {
  total: number;
  sponsors: string[];
}

const registry: Registry<Data> = {
  total: defineComponent<Data, { text: string; variant: string }>({
    variants: ["hero", "compact"],
    select: (data, { variant }) => ({ text: `$${data.total}`, variant }),
    component: ({ text, variant }) => <span data-variant={variant}>{text}</span>,
  }),
  sponsors: defineComponent<Data, { names: string[] }>({
    variants: ["default"],
    select: (data) => (data.sponsors.length ? { names: data.sponsors } : null),
    component: ({ names }) => <span>{names.join(", ")}</span>,
  }),
  label: defineComponent<Data, { text: string }>({
    variants: ["default"],
    select: (_data, { options }) => ({ text: String(options.text ?? "") }),
    component: ({ text }) => <span>{text}</span>,
  }),
  broken: defineComponent<Data, object>({
    variants: ["default"],
    select: () => ({}),
    component: () => {
      throw new Error("boom");
    },
  }),
};

const layout = LayoutDefinitionSchema.parse({
  id: "test",
  name: "Test",
  grid: { columns: "1fr 1fr", rows: "1fr auto", areas: ["hero side", "bar bar"] },
  slots: {
    hero: { component: "total", variant: "hero" },
    side: { component: "sponsors" },
    bar: { component: "label", options: { text: "Bid now!" } },
  },
  overlays: [{ component: "total", variant: "compact" }],
});

describe("validateLayout", () => {
  it("accepts a valid layout", () => {
    expect(validateLayout(layout, registry)).toEqual([]);
  });

  it("reports every problem it finds", () => {
    const problems = validateLayout(
      {
        ...layout,
        grid: { ...layout.grid, areas: ["hero side", "bar"] },
        slots: { hero: { component: "total", variant: "giant" }, extra: { component: "nope" } },
      },
      registry,
    );
    expect(problems).toEqual([
      "grid.areas: every row needs the same number of cells",
      'Area "side" has no slot',
      'Area "bar" has no slot',
      'Slot "extra" isn\'t in the grid',
      'Slot "hero": "total" has no variant "giant" (has hero, compact)',
      'Slot "extra": unknown component "nope"',
    ]);
  });

  it("reports schema errors", () => {
    expect(validateLayout({ id: "x" }, registry)[0]).toMatch(/^name: /);
  });
});

describe("LayoutRenderer", () => {
  it("fills each area with its component, selected from data", () => {
    render(<LayoutRenderer layout={layout} registry={registry} data={{ total: 100, sponsors: ["Acme"] }} fit="none" />);
    expect(screen.getAllByText("$100").map((el) => el.dataset.variant)).toEqual(["hero", "compact"]);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Bid now!")).toBeInTheDocument();
  });

  it("renders nothing for a slot whose selector returns null", () => {
    const { container } = render(
      <LayoutRenderer layout={layout} registry={registry} data={{ total: 1, sponsors: [] }} fit="none" />,
    );
    expect(container.querySelector(".layout-slot--side .layout-slot__content")).toBeEmptyDOMElement();
  });

  it("keeps the rest of the screen up when one component fails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...layout, slots: { ...layout.slots, side: { component: "broken", options: {} } } };
    const { container } = render(
      <LayoutRenderer layout={broken} registry={registry} data={{ total: 5, sponsors: [] }} fit="none" />,
    );
    expect(container.querySelector('[data-slot-error="side"]')).not.toBeNull();
    expect(screen.getAllByText("$5")).toHaveLength(2);
    spy.mockRestore();
  });

  it("scales each slot's content for its measured size", () => {
    let observed: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const sizes: Record<string, number> = { hero: 600, side: 300, bar: 900 };
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      const area = [...this.classList].find((c) => c.startsWith("layout-slot--"))?.slice("layout-slot--".length);
      return area ? (sizes[area] ?? 0) : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
    const slotScale = vi.fn((slot: { component: string }, size: { width: number }) =>
      slot.component === "total" ? size.width / 300 : 1,
    );

    const { container } = render(
      <LayoutRenderer
        layout={layout}
        registry={registry}
        data={{ total: 1, sponsors: ["A"] }}
        fit="none"
        slotScale={slotScale}
      />,
    );
    act(() => observed?.());
    const content = (area: string) =>
      container.querySelector(`.layout-slot--${area} .layout-slot__content`) as HTMLElement;
    expect(content("hero").dataset.scale).toBe("2");
    expect(content("side").dataset.scale).toBe("1");
    expect(slotScale).toHaveBeenCalledWith(layout.slots.hero, { width: 600, height: 100 });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scales the stage to fit the window", () => {
    Object.assign(window, { innerWidth: 960, innerHeight: 1000 });
    const { container } = render(
      <LayoutRenderer layout={layout} registry={registry} data={{ total: 1, sponsors: [] }} />,
    );
    expect((container.querySelector(".layout-stage") as HTMLElement).style.transform).toBe("scale(0.5)");
  });
});
