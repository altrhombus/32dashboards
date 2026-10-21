import type { ComponentType } from "react";
import { LayoutDefinitionSchema, gridAreaNames, type LayoutDefinition, type Slot } from "./definition.js";

/**
 * A component a layout can place. It declares its data dependency as
 * `select`, which picks its props from the layout's data (and the slot's
 * options), so layouts never wire props by hand. Returning null renders
 * nothing, e.g. a sponsor slot when there are no sponsors.
 */
export interface LayoutComponent<D, P extends object = object> {
  /** Size variants the component supports, e.g. ["hero", "compact"]. The first is the default. */
  variants: readonly string[];
  select(data: D, slot: { variant: string; options: Record<string, unknown> }): P | null;
  component: ComponentType<P>;
}

export type Registry<D> = Record<string, LayoutComponent<D, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Declares a layout component; checks that `select` returns the props `component` takes. */
export function defineComponent<D, P extends object>(definition: LayoutComponent<D, P>): LayoutComponent<D, P> {
  return definition;
}

export function variantOf(slot: Slot, entry: LayoutComponent<unknown>): string {
  return slot.variant ?? entry.variants[0] ?? "default";
}

/**
 * Checks a layout against a registry: valid shape, a slot for every grid
 * area and no slots outside it, known components, and declared variants.
 * Returns problems as readable strings; empty means valid.
 */
export function validateLayout<D>(layout: unknown, registry: Registry<D>): string[] {
  const parsed = LayoutDefinitionSchema.safeParse(layout);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${issue.path.join(".") || "(layout)"}: ${issue.message}`);
  }
  const def: LayoutDefinition = parsed.data;
  const problems: string[] = [];
  const areas = gridAreaNames(def.grid.areas);
  const widths = new Set(def.grid.areas.map((row) => row.trim().split(/\s+/).length));
  if (widths.size > 1) problems.push("grid.areas: every row needs the same number of cells");

  for (const area of areas) if (!(area in def.slots)) problems.push(`Area "${area}" has no slot`);
  for (const area of Object.keys(def.slots))
    if (!areas.includes(area)) problems.push(`Slot "${area}" isn't in the grid`);

  const checkSlot = (where: string, slot: Slot) => {
    const entry = registry[slot.component];
    if (!entry) return problems.push(`${where}: unknown component "${slot.component}"`);
    if (slot.variant && !entry.variants.includes(slot.variant)) {
      problems.push(
        `${where}: "${slot.component}" has no variant "${slot.variant}" (has ${entry.variants.join(", ")})`,
      );
    }
  };
  for (const [area, slot] of Object.entries(def.slots)) checkSlot(`Slot "${area}"`, slot);
  def.overlays.forEach((slot, i) => checkSlot(`Overlay ${i}`, slot));
  return problems;
}
