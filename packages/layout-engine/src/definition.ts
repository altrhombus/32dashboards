import { z } from "zod";

/*
 * A layout is data: a CSS grid on a fixed-size stage, with each named area
 * (a slot) filled by a registered component in one of its size variants.
 * New looks are new layout data; new components are the only code.
 */

const areaName = z.string().regex(/^[a-zA-Z][\w-]*$/, "Area names are letters, digits, - and _");

export const SlotSchema = z.object({
  component: z.string().min(1),
  /** One of the component's declared variants; its first variant when omitted. */
  variant: z.string().optional(),
  /** Static, per-slot options passed to the component's data selector. */
  options: z.record(z.string(), z.unknown()).default({}),
});
export type Slot = z.infer<typeof SlotSchema>;

export const LayoutDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The design size in px; the stage scales to fit any screen at this aspect ratio. */
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  grid: z.object({
    columns: z.string().min(1),
    rows: z.string().min(1),
    /** Rows of area names, like CSS grid-template-areas; "." leaves a cell empty. */
    areas: z.array(z.string().min(1)).min(1),
    gap: z.string().default("0"),
    padding: z.string().default("0"),
  }),
  slots: z.record(areaName, SlotSchema),
  /** Slots drawn over the grid, full-stage (celebrations, toasts). Rendered in order. */
  overlays: z.array(SlotSchema).default([]),
});
export type LayoutDefinition = z.infer<typeof LayoutDefinitionSchema>;
export type LayoutDefinitionInput = z.input<typeof LayoutDefinitionSchema>;

/** The distinct area names a grid uses. */
export function gridAreaNames(areas: string[]): string[] {
  return [...new Set(areas.flatMap((row) => row.trim().split(/\s+/)).filter((name) => name !== "."))];
}
