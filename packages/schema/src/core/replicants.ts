import { z } from "zod";
import { FundraiserEventSchema, timestamp } from "./event.js";
import { SourceItemSchema, SourceResultSchema } from "./source.js";
import { SceneIdSchema } from "./show.js";

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

/** What an adapter is doing right now, for operators. */
export const SourceStatusSchema = z.object({
  state: z.enum(["idle", "working", "ok", "error"]),
  message: z.string().max(500).nullable(),
  /** The event the status refers to, if any. */
  eventId: z.string().uuid().nullable(),
  updatedAt: timestamp(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

/**
 * Replicant `sources` (not persisted): adapters registered since NodeCG
 * started, with their live status, so panels can offer them when
 * configuring an event and show at a glance whether data is flowing.
 */
export const RegisteredSourcesReplicantSchema = z.array(
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    registeredAt: timestamp(),
    status: SourceStatusSchema,
    lastResultAt: timestamp().nullable(),
  }),
);
export type RegisteredSourcesReplicant = z.infer<typeof RegisteredSourcesReplicantSchema>;
export type RegisteredSource = RegisteredSourcesReplicant[number];

export const SOURCE_LOG_LIMIT = 200;

export const SourceLogEntrySchema = z.object({
  at: timestamp(),
  sourceId: z.string().min(1),
  level: z.enum(["info", "warn", "error"]),
  message: z.string().max(1000),
  eventId: z.string().uuid().nullable(),
});
export type SourceLogEntry = z.infer<typeof SourceLogEntrySchema>;

/** Replicant `sourceLog` (not persisted): recent adapter log lines, newest last. */
export const SourceLogReplicantSchema = z.array(SourceLogEntrySchema).max(SOURCE_LOG_LIMIT);
export type SourceLogReplicant = z.infer<typeof SourceLogReplicantSchema>;

/**
 * Something worth celebrating on screen. `total-increase` and `new-bid`
 * come from comparing a source result with the previous one for the same
 * event; `milestone` and `incentive-met` from the displayed total crossing
 * a threshold. Sent as the `donationMoment` Message and kept in the
 * `moments` Replicant.
 */
export const DonationMomentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("total-increase"),
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    at: timestamp(),
    delta: z.number().positive(),
    total: z.number(),
  }),
  z.object({
    kind: z.literal("milestone"),
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    at: timestamp(),
    milestoneId: z.string().uuid(),
    amount: z.number(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal("incentive-met"),
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    at: timestamp(),
    incentiveId: z.string().uuid(),
    name: z.string(),
    target: z.number(),
  }),
  z.object({
    kind: z.literal("new-bid"),
    id: z.string().uuid(),
    eventId: z.string().uuid(),
    at: timestamp(),
    itemId: z.string().min(1),
    itemTitle: z.string(),
    amount: z.number().nullable(),
    bidCount: z.number().int().nonnegative().nullable(),
  }),
]);
export type DonationMoment = z.infer<typeof DonationMomentSchema>;

export const MOMENTS_LIMIT = 50;

/** Replicant `moments` (not persisted): recent donation moments for the active event, newest last. */
export const MomentsReplicantSchema = z.array(DonationMomentSchema).max(MOMENTS_LIMIT);
export type MomentsReplicant = z.infer<typeof MomentsReplicantSchema>;

/** Replicant `scene` (persisted): what the show is doing right now. */
export const SceneReplicantSchema = z.object({
  id: SceneIdSchema,
  /** Intermission: when the show resumes, for the countdown. */
  countdownTo: timestamp().nullable(),
  /** Intermission: a short message, e.g. "Back after dinner!". */
  message: z.string().max(160).nullable(),
  changedAt: timestamp(),
});
export type SceneReplicant = z.infer<typeof SceneReplicantSchema>;

/**
 * Replicant `outputs` (not persisted): graphics that have checked in
 * recently, so operators can see the TV is actually showing the kiosk.
 * Previews in the dashboard don't check in.
 */
export const OutputsReplicantSchema = z.array(
  z.object({
    instanceId: z.string().min(1).max(100),
    output: z.string().min(1).max(60),
    lastSeenAt: timestamp(),
    firstSeenAt: timestamp(),
  }),
);
export type OutputsReplicant = z.infer<typeof OutputsReplicantSchema>;
