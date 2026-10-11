import { z } from "zod";
import { SourceItemSchema } from "@32dashboards/schema/core";

export const SOURCE_ID = "manual";

const eventId = z.string().uuid();
const money = z.number().finite().nonnegative();

/** What the operator has entered for one event. */
export const ManualEntrySchema = z.object({
  total: money,
  items: z.array(SourceItemSchema).max(500),
});
export type ManualEntry = z.infer<typeof ManualEntrySchema>;

/** Replicant `entries` (persisted): event id -> entry. */
export const EntriesReplicantSchema = z.record(z.string(), ManualEntrySchema);
export type EntriesReplicant = z.infer<typeof EntriesReplicantSchema>;

/** The editable fields of an item; `id` is assigned by the server for new items. */
export const ItemInputSchema = SourceItemSchema.pick({ title: true })
  .extend({
    id: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(200),
    currentBid: money.nullable().default(null),
    value: money.nullable().default(null),
    bidCount: z.number().int().nonnegative().nullable().default(null),
    imageUrl: z.string().url().nullable().default(null),
    remaining: z.string().max(100).nullable().default(null),
  })
  .strict();

export const manualMessageSchemas = {
  /** Replaces the total, e.g. to match a tally sheet. */
  setTotal: z.object({ eventId, total: money }).strict(),
  /** Adds one donation to the total; shows on screen as a donation moment. */
  addDonation: z.object({ eventId, amount: z.number().finite().positive() }).strict(),
  /** Adds an item, or replaces the one with the same id. Acks the item id. */
  upsertItem: z.object({ eventId, item: ItemInputSchema }).strict(),
  removeItem: z.object({ eventId, itemId: z.string().min(1) }).strict(),
} as const;
export type ManualMessageName = keyof typeof manualMessageSchemas;
export type ManualMessagePayload<N extends ManualMessageName> = z.input<(typeof manualMessageSchemas)[N]>;
