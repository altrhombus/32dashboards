import { z } from "zod";
import { FundraiserEventSchema, timestamp } from "./event.js";
import { SourceItemSchema, SourceResultSchema } from "./source.js";

/*
 * fundraiser-core's Replicants. bundles/fundraiser-core/src/schemas re-exports
 * these under their Replicant names, and the bundle build turns each into the
 * JSON Schema NodeCG validates against.
 */

/** Replicant `events` (persisted): every event on this install. */
export const EventsReplicantSchema = z.array(FundraiserEventSchema);
export type EventsReplicant = z.infer<typeof EventsReplicantSchema>;

/** Replicant `activeEventId` (persisted): the event on screen, if any. */
export const ActiveEventIdReplicantSchema = z.string().uuid().nullable();
export type ActiveEventIdReplicant = z.infer<typeof ActiveEventIdReplicantSchema>;

/** Replicant `sourceResults` (persisted): the latest raw result per event id. */
export const SourceResultsReplicantSchema = z.record(z.string(), SourceResultSchema);
export type SourceResultsReplicant = z.infer<typeof SourceResultsReplicantSchema>;

/**
 * Replicant `liveState` (derived, not persisted): what graphics render. The
 * core recomputes it whenever the persisted Replicants change, so displays
 * never apply the adjustment or filters themselves.
 */
export const LiveStateReplicantSchema = z.object({
  event: FundraiserEventSchema.nullable(),
  rawTotal: z.number(),
  adjustment: z.number(),
  total: z.number(),
  items: z.array(SourceItemSchema),
  hiddenItemCount: z.number().int().nonnegative(),
  sourceId: z.string().nullable(),
  observedAt: timestamp().nullable(),
});
export type LiveStateReplicant = z.infer<typeof LiveStateReplicantSchema>;

/**
 * Replicant `sources` (not persisted): adapters registered since NodeCG
 * started, so panels can offer them when configuring an event.
 */
export const RegisteredSourcesReplicantSchema = z.array(
  z.object({ id: z.string().min(1), registeredAt: timestamp() }),
);
export type RegisteredSourcesReplicant = z.infer<typeof RegisteredSourcesReplicantSchema>;
