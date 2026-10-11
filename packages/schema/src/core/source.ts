import { z } from "zod";
import { timestamp } from "./event.js";

/** One auction item or donation line, as normalized by a source adapter. */
export const SourceItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  imageUrl: z.string().nullable().default(null),
  currentBid: z.number().finite().nullable().default(null),
  value: z.number().finite().nullable().default(null),
  bidCount: z.number().int().nonnegative().nullable().default(null),
  /** Free-form time left as the platform shows it (e.g. "2 days"). */
  remaining: z.string().nullable().default(null),
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

/**
 * What an adapter reports: only what it observed, never adjusted or
 * filtered. `eventId` is set by the adapter when it starts the fetch, so a
 * result that lands after an event switch is still stored on the right event.
 */
export const SourceResultSchema = z.object({
  sourceId: z.string().min(1),
  eventId: z.string().uuid(),
  total: z.number().finite().nonnegative(),
  items: z.array(SourceItemSchema).default([]),
  observedAt: timestamp(),
});
export type SourceResult = z.infer<typeof SourceResultSchema>;
export type SourceResultInput = z.input<typeof SourceResultSchema>;
