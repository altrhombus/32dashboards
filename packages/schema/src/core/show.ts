import { z } from "zod";

/*
 * Per-event show content beyond the total: milestones, bid wars, prizes,
 * the call to action, and how the info bar rotates. Edited by operators,
 * rendered by layout bundles.
 */

const id = z.string().uuid();

/** A round-number total worth celebrating when the displayed total crosses it. */
export const MilestoneSchema = z.object({
  id,
  amount: z.number().positive(),
  /** Optional words for the celebration, e.g. "We funded a new van!". */
  label: z.string().max(120).default(""),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const BidWarOptionSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  total: z.number().nonnegative().default(0),
});
export type BidWarOption = z.infer<typeof BidWarOptionSchema>;

/**
 * Options competing for donations (e.g. "Name the shelter's new puppy").
 * Option totals are kept by operators, since auction platforms don't track
 * them.
 */
export const BidWarSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  /** Shown in the info bar rotation. */
  active: z.boolean().default(true),
  options: z.array(BidWarOptionSchema).max(12).default([]),
});
export type BidWar = z.infer<typeof BidWarSchema>;

export const PrizeSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  /** Donating at least this much enters the drawing; null for no minimum. */
  minimumDonation: z.number().nonnegative().nullable().default(null),
  active: z.boolean().default(true),
});
export type Prize = z.infer<typeof PrizeSchema>;

export const INFO_BAR_SEGMENTS = [
  "items",
  "incentives",
  "bidWars",
  "prizes",
  "callToAction",
  "announcements",
  "sponsors",
] as const;
export const InfoBarSegmentKindSchema = z.enum(INFO_BAR_SEGMENTS);
export type InfoBarSegmentKind = z.infer<typeof InfoBarSegmentKindSchema>;

/** Which segments the info bar rotates through, in order, and for how long each shows. */
export const InfoBarConfigSchema = z.object({
  segments: z.array(InfoBarSegmentKindSchema).max(INFO_BAR_SEGMENTS.length).default([...INFO_BAR_SEGMENTS]),
  segmentSeconds: z.number().int().min(4).max(120).default(12),
});
export type InfoBarConfig = z.infer<typeof InfoBarConfigSchema>;

/** The show's current state. Every output (venue TV now, stream later) renders its own layout per scene. */
export const SCENE_IDS = ["main", "intermission", "askMe", "celebration"] as const;
export const SceneIdSchema = z.enum(SCENE_IDS);
export type SceneId = z.infer<typeof SceneIdSchema>;
