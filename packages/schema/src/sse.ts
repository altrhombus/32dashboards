import { z } from "zod";
import { PublicEventConfigSchema } from "./event.js";
import { AuctionStateSchema } from "./auctionState.js";

/**
 * The three (and only three) SSE event types broadcast on GET /events.
 * Incentive displayNow/displayUntilMet changes ride on a full "config"
 * resend rather than a fourth granular event type -- see plan rationale:
 * one source of truth for incentive state client-side.
 */
export const SseConfigEventSchema = z.object({
  type: z.literal("config"),
  data: PublicEventConfigSchema,
});

export const SseAuctionStateEventSchema = z.object({
  type: z.literal("auction-state"),
  data: AuctionStateSchema,
});

export const SsePingEventSchema = z.object({
  type: z.literal("ping"),
  data: z.object({ at: z.string().datetime() }),
});

export const SseEventSchema = z.discriminatedUnion("type", [
  SseConfigEventSchema,
  SseAuctionStateEventSchema,
  SsePingEventSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
