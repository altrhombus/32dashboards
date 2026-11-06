import { z } from "zod";
import { ThemeSchema } from "../theme.js";
import { IncentiveSchema } from "../incentive.js";
import { SponsorSchema } from "../sponsor.js";
import { AskMeConfigSchema } from "../askme.js";
import { BidWarSchema, InfoBarConfigSchema, MAX_MILESTONES, MilestoneSchema, PrizeSchema } from "./show.js";

/** The logos' heading unless an event says otherwise. */
export const SPONSORS_TITLE = "Thank you to our sponsors";

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

/** One planned Ask Me appeal. `raised` is set when the round finishes (null while it hasn't). */
export const AskMeRoundSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().max(120).default(""),
  message: z.string().max(1200).default(""),
  raised: z.number().finite().nonnegative().nullable().default(null),
});
export type AskMeRound = z.infer<typeof AskMeRoundSchema>;

/** How many announcements an event can have, and how long each can be. */
export const MAX_ANNOUNCEMENTS = 50;
export const MAX_ANNOUNCEMENT_LENGTH = 200;

/** Turns the one-per-line text panels edit into announcements. */
export function parseAnnouncements(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

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
  /** At endDateTime, switch the TVs to the Celebration scene (otherwise they only announce it). */
  celebrateAtClose: z.boolean().default(false),
  theme: EventThemeSchema,
  announcements: z.array(z.string().max(MAX_ANNOUNCEMENT_LENGTH)).max(MAX_ANNOUNCEMENTS).default([]),
  askMe: AskMeConfigSchema,
  incentives: z.array(IncentiveSchema).default([]),
  sponsors: z.array(SponsorSchema).default([]),
  /** The heading over the logos in `sponsors`: sponsors, or e.g. the causes the event helps. */
  sponsorsTitle: z.string().trim().max(60).default(SPONSORS_TITLE),
  /** How long each logo shows in a Logos block before the next (the info bar has its own timing). */
  sponsorsSeconds: z.number().int().min(2).max(60).default(6),
  milestones: z.array(MilestoneSchema).max(MAX_MILESTONES).default([]),
  bidWars: z.array(BidWarSchema).max(20).default([]),
  prizes: z.array(PrizeSchema).max(50).default([]),
  /** One line telling viewers how to give, e.g. "Bid at 32auctions.com/spring-gala". */
  callToAction: z.string().max(160).default(""),
  infoBar: InfoBarConfigSchema.default({}),
  source: EventSourceSchema,
  /** Added to the source's total, e.g. for cash or checks taken at the venue. */
  adjustment: z.number().finite().default(0),
  /** Money from finished Ask Me rounds (kept apart from venue cash). In the total only with askMeInTotal. */
  askMeRaised: z.number().finite().nonnegative().default(0),
  /**
   * Whether finished Ask Me rounds are added to the total on the TVs. Off by
   * default: usually Ask Me gifts are entered in the auction too (e.g. as an
   * item), so the source's total already has them.
   */
  askMeInTotal: z.boolean().default(false),
  /**
   * Ask Me appeals planned for the night, in order, each with its own title
   * and message. Empty: one appeal (askMe's title and message) that repeats.
   */
  askMeRounds: z.array(AskMeRoundSchema).max(20).default([]),
  /** Which planned round is on now (an index into askMeRounds); past the end once all are done. */
  askMeCurrent: z.number().int().nonnegative().default(0),
  /** Case-insensitive title substrings; matching items are hidden from displays. */
  filters: z.array(z.string().min(1).max(100)).max(100).default([]),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});
export type FundraiserEvent = z.infer<typeof FundraiserEventSchema>;
