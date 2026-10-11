import { Component, useEffect, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import type { LayoutDefinition, Slot } from "./definition.js";
import { variantOf, type Registry } from "./registry.js";

/** Isolates each slot, so one failing component can't blank the whole screen. */
class SlotBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Layout slot "${this.props.name}" failed:`, error, info.componentStack);
  }

  override componentDidUpdate(previous: { children: ReactNode }) {
    // New data may fix it; try again.
    if (this.state.failed && previous.children !== this.props.children) this.setState({ failed: false });
  }

  override render() {
    return this.state.failed ? <div data-slot-error={this.props.name} /> : this.props.children;
  }
}

function RenderSlot<D>({ name, slot, registry, data }: { name: string; slot: Slot; registry: Registry<D>; data: D }) {
  const entry = registry[slot.component];
  if (!entry) {
    console.error(`Layout slot "${name}" uses unknown component "${slot.component}"`);
    return <div data-slot-error={name} />;
  }
  const props = entry.select(data, { variant: variantOf(slot, entry), options: slot.options });
  if (props === null) return null;
  const Rendered = entry.component;
  return <Rendered {...props} />;
}

export interface LayoutRendererProps<D> {
  layout: LayoutDefinition;
  registry: Registry<D>;
  data: D;
  /** Scale the stage to fit the window (default) or render it at design size. */
  fit?: "window" | "none";
}

/**
 * Renders a layout on a fixed-size stage (its design size), scaled to fit
 * the window and centered, so one layout works on any screen with the same
 * aspect ratio.
 */
export function LayoutRenderer<D>({ layout, registry, data, fit = "window" }: LayoutRendererProps<D>) {
  const scale = useFitScale(layout.width, layout.height, fit === "window");
  const { grid } = layout;

  const stage: CSSProperties = {
    position: "relative",
    width: layout.width,
    height: layout.height,
    transform: scale === 1 ? undefined : `scale(${scale})`,
    transformOrigin: "top left",
    overflow: "hidden",
  };
  const gridStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "grid",
    gridTemplateColumns: grid.columns,
    gridTemplateRows: grid.rows,
    gridTemplateAreas: grid.areas.map((row) => `"${row}"`).join(" "),
    gap: grid.gap,
    padding: grid.padding,
    boxSizing: "border-box",
  };

  return (
    <div className="layout-viewport" style={{ width: layout.width * scale, height: layout.height * scale, margin: "0 auto" }}>
      <div className="layout-stage" data-layout={layout.id} style={stage}>
        <div className="layout-grid" style={gridStyle}>
          {Object.entries(layout.slots).map(([area, slot]) => (
            <div key={area} className={`layout-slot layout-slot--${area}`} style={{ gridArea: area, minWidth: 0, minHeight: 0 }}>
              <SlotBoundary name={area}>
                <RenderSlot name={area} slot={slot} registry={registry} data={data} />
              </SlotBoundary>
            </div>
          ))}
        </div>
        {layout.overlays.map((slot, i) => (
          <div key={i} className="layout-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <SlotBoundary name={`overlay-${i}`}>
              <RenderSlot name={`overlay-${i}`} slot={slot} registry={registry} data={data} />
            </SlotBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}

function useFitScale(width: number, height: number, enabled: boolean): number {
  const compute = () =>
    enabled && typeof window !== "undefined" && window.innerWidth > 0
      ? Math.min(window.innerWidth / width, window.innerHeight / height)
      : 1;
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    if (!enabled) return setScale(1);
    const onResize = () => setScale(compute());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, enabled]);
  return scale;
}
