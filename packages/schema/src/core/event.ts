import { z } from "zod";
import { ThemeSchema } from "../theme.js";
import { IncentiveSchema } from "../incentive.js";
import { SponsorSchema } from "../sponsor.js";
import { AskMeConfigSchema } from "../askme.js";
import { BidWarSchema, InfoBarConfigSchema, MilestoneSchema, PrizeSchema } from "./show.js";

export const timestamp = () => z.string().datetime({ offset: true });

/**
 * The legacy theme, except `logoUrl` also accepts a dashboard-uploaded
 * asset's path ("/assets/fundraiser-core/event-logos/logo.png"), which
 * isn't an absolute URL.
 */
export const EventThemeSchema = ThemeSchema.extend({
  logoUrl: z.string().max(1000).nullable().default(null),
});
export type EventTheme = z.infer<typeof EventThemeSchema>;

/**
 * Which adapter feeds an event. Adapter-specific settings (including any
 * credentials) are owned by the adapter bundle, never stored here: every
 * graphic can read core Replicants, so nothing secret may live in them.
 */
export const EventSourceSchema = z.object({
  adapterId: z.string().min(1).nullable().default(null),
});
export type EventSource = z.infer<typeof EventSourceSchema>;

/**
 * One fundraiser. Many are kept on an install (past ones for reuse, future
 * ones in prep); `activeEventId` picks the one on screen. The adjustment and
 * filters belong to the event, so they persist and travel with it.
 */
export const FundraiserEventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  causeName: z.string().max(200).default(""),
  endDateTime: timestamp().nullable().default(null),
  theme: EventThemeSchema,
  announcements: z.array(z.string().max(200)).max(50).default([]),
  askMe: AskMeConfigSchema,
  incentives: z.array(IncentiveSchema).default([]),
  sponsors: z.array(SponsorSchema).default([]),
  milestones: z.array(MilestoneSchema).max(50).default([]),
  bidWars: z.array(BidWarSchema).max(20).default([]),
  prizes: z.array(PrizeSchema).max(50).default([]),
  /** One line telling viewers how to give, e.g. "Bid at 32auctions.com/spring-gala". */
  callToAction: z.string().max(160).default(""),
  infoBar: InfoBarConfigSchema.default({}),
  source: EventSourceSchema,
  /** Added to the source's total, e.g. for cash or checks taken at the venue. */
  adjustment: z.number().finite().default(0),
  /** Case-insensitive title substrings; matching items are hidden from displays. */
  filters: z.array(z.string().min(1).max(100)).max(100).default([]),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});
export type FundraiserEvent = z.infer<typeof FundraiserEventSchema>;
