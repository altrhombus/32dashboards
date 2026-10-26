import { z } from "zod";
import { FundraiserEventSchema } from "./event.js";
import { EventThemeSchema } from "./event.js";
import { AskMeConfigSchema } from "../askme.js";
import { InfoBarConfigSchema, SceneIdSchema } from "./show.js";
import { SceneReplicantSchema, ScreenIdSchema, ScreenSchema } from "./replicants.js";

/*
 * Operator Messages fundraiser-core listens for. Each payload is validated
 * with these schemas; the ack returns the result or an Error. Commands that
 * change one event name it explicitly, so a click can never land on a
 * different event than the one the operator was looking at.
 */

const eventId = z.string().uuid();

export const CreateEventMessageSchema = FundraiserEventSchema.pick({ name: true })
  .extend({
    causeName: z.string().max(200).optional(),
    endDateTime: FundraiserEventSchema.shape.endDateTime.optional(),
  })
  .strict();
export type CreateEventMessage = z.infer<typeof CreateEventMessageSchema>;

export const UpdateEventMessageSchema = z
  .object({
    eventId,
    patch: FundraiserEventSchema.pick({
      name: true,
      causeName: true,
      endDateTime: true,
      announcements: true,
      incentives: true,
      sponsors: true,
      milestones: true,
      bidWars: true,
      prizes: true,
      callToAction: true,
      source: true,
    })
      .extend({
        theme: EventThemeSchema.partial(),
        askMe: AskMeConfigSchema.partial(),
        infoBar: InfoBarConfigSchema.partial(),
      })
      .partial()
      .strict(),
  })
  .strict();
export type UpdateEventMessage = z.infer<typeof UpdateEventMessageSchema>;

export const DuplicateEventMessageSchema = z
  .object({ eventId, name: FundraiserEventSchema.shape.name.optional() })
  .strict();
export type DuplicateEventMessage = z.infer<typeof DuplicateEventMessageSchema>;

export const DeleteEventMessageSchema = z.object({ eventId }).strict();
export type DeleteEventMessage = z.infer<typeof DeleteEventMessageSchema>;

/** `eventId: null` takes every event off screen. */
export const ActivateEventMessageSchema = z.object({ eventId: eventId.nullable() }).strict();
export type ActivateEventMessage = z.infer<typeof ActivateEventMessageSchema>;

export const SetAdjustmentMessageSchema = z.object({ eventId, amount: z.number().finite() }).strict();
export type SetAdjustmentMessage = z.infer<typeof SetAdjustmentMessageSchema>;

/** Adds `delta` to the current adjustment (quick +/- buttons). */
export const NudgeAdjustmentMessageSchema = z.object({ eventId, delta: z.number().finite() }).strict();
export type NudgeAdjustmentMessage = z.infer<typeof NudgeAdjustmentMessageSchema>;

/**
 * Adds `delta` to the Ask Me total. The server does the adding, so quick
 * taps from a phone that hasn't seen the last one yet all count.
 */
export const NudgeAskMeMessageSchema = z.object({ eventId, delta: z.number().finite() }).strict();
export type NudgeAskMeMessage = z.infer<typeof NudgeAskMeMessageSchema>;

export const SetFiltersMessageSchema = z.object({ eventId, filters: FundraiserEventSchema.shape.filters }).strict();
export type SetFiltersMessage = z.infer<typeof SetFiltersMessageSchema>;

/** Asks the event's adapter to fetch now instead of waiting for its next cycle. */
export const RefreshSourceMessageSchema = z.object({ eventId }).strict();
export type RefreshSourceMessage = z.infer<typeof RefreshSourceMessageSchema>;

/** Adds to (or, negative, takes from) one bid war option's total. */
export const NudgeBidWarMessageSchema = z
  .object({ eventId, bidWarId: z.string().uuid(), optionId: z.string().uuid(), delta: z.number().finite() })
  .strict();
export type NudgeBidWarMessage = z.infer<typeof NudgeBidWarMessageSchema>;

/** Switches every output to a scene. Intermission takes an optional countdown and message. */
export const SwitchSceneMessageSchema = z
  .object({
    id: SceneIdSchema,
    countdownTo: SceneReplicantSchema.shape.countdownTo.optional(),
    message: SceneReplicantSchema.shape.message.optional(),
  })
  .strict();
export type SwitchSceneMessage = z.infer<typeof SwitchSceneMessageSchema>;

/** Sent every few seconds by an output (e.g. the venue-TV kiosk) so operators know it's live. */
export const OutputHeartbeatMessageSchema = z
  .object({
    instanceId: z.string().min(1).max(100),
    output: z.string().min(1).max(60),
    screenId: ScreenIdSchema.nullable().optional(),
  })
  .strict();
export type OutputHeartbeatMessage = z.infer<typeof OutputHeartbeatMessageSchema>;

/** Adds a screen, or replaces the one with the same id. */
export const SaveScreenMessageSchema = ScreenSchema.strict();
export type SaveScreenMessage = z.infer<typeof SaveScreenMessageSchema>;

export const DeleteScreenMessageSchema = z.object({ id: ScreenIdSchema }).strict();
export type DeleteScreenMessage = z.infer<typeof DeleteScreenMessageSchema>;

/**
 * Copies an image from the auction site into an asset category (e.g. the
 * organization's logo while setting up an event). Acks its asset URL.
 */
export const ImportAssetMessageSchema = z
  .object({
    category: z.enum(["event-logos", "sponsor-logos"]),
    url: z.string().url().max(2000),
    /** Becomes the file name. */
    name: z.string().trim().min(1).max(120),
  })
  .strict();
export type ImportAssetMessage = z.infer<typeof ImportAssetMessageSchema>;

/** Asks for the laptop's network addresses and port, for opening the dashboard on a phone. */
export const ConnectionInfoMessageSchema = z.object({}).strict().optional();

/** Message name -> payload schema. */
export const coreMessageSchemas = {
  createEvent: CreateEventMessageSchema,
  updateEvent: UpdateEventMessageSchema,
  duplicateEvent: DuplicateEventMessageSchema,
  deleteEvent: DeleteEventMessageSchema,
  activateEvent: ActivateEventMessageSchema,
  setAdjustment: SetAdjustmentMessageSchema,
  nudgeAdjustment: NudgeAdjustmentMessageSchema,
  nudgeAskMe: NudgeAskMeMessageSchema,
  setFilters: SetFiltersMessageSchema,
  refreshSource: RefreshSourceMessageSchema,
  nudgeBidWar: NudgeBidWarMessageSchema,
  switchScene: SwitchSceneMessageSchema,
  outputHeartbeat: OutputHeartbeatMessageSchema,
  saveScreen: SaveScreenMessageSchema,
  deleteScreen: DeleteScreenMessageSchema,
  importAsset: ImportAssetMessageSchema,
  connectionInfo: ConnectionInfoMessageSchema,
} as const;
export type CoreMessageName = keyof typeof coreMessageSchemas;
export type CoreMessagePayload<N extends CoreMessageName> = z.input<(typeof coreMessageSchemas)[N]>;
