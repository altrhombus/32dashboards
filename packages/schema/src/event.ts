import { z } from "zod";
import { ThemeSchema } from "./theme.js";
import { IncentiveSchema } from "./incentive.js";
import { SponsorSchema } from "./sponsor.js";
import { AskMeConfigSchema } from "./askme.js";
import { ScraperSourceSchema } from "./scraperSource.js";

export const EventConfigSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(80),
  isActive: z.boolean().default(false),
  name: z.string().min(1).max(200),
  causeName: z.string().max(200).default(""),
  endDateTime: z.string().datetime().nullable().default(null),
  theme: ThemeSchema,
  announcements: z.array(z.string().max(200)).max(50).default([]),
  askMe: AskMeConfigSchema,
  incentives: z.array(IncentiveSchema).default([]),
  sponsors: z.array(SponsorSchema).default([]),
  scraperSource: ScraperSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type EventConfig = z.infer<typeof EventConfigSchema>;

/**
 * What's actually broadcast to public kiosk displays over SSE. Strips
 * scraperSource entirely -- sessionCookie/authToken are admin-only secrets
 * and must never reach a public-facing browser.
 */
export const PublicEventConfigSchema = EventConfigSchema.omit({ scraperSource: true });
export type PublicEventConfig = z.infer<typeof PublicEventConfigSchema>;

export function toPublicEventConfig(event: EventConfig): PublicEventConfig {
  const { scraperSource: _scraperSource, ...publicConfig } = event;
  return publicConfig;
}

export const CreateEventInputSchema = EventConfigSchema.pick({
  slug: true,
  name: true,
}).extend({
  causeName: z.string().max(200).optional(),
  endDateTime: z.string().datetime().nullable().optional(),
  theme: ThemeSchema.partial().optional(),
  scraperSource: ScraperSourceSchema.pick({
    orgId: true,
    auctionId: true,
    friendlyAuctionPath: true,
  }).extend({
    sessionCookie: z.string().nullable().optional(),
    authToken: z.string().nullable().optional(),
    refreshIntervalSeconds: z.number().int().positive().optional(),
  }),
});
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

export const UpdateEventInputSchema = EventConfigSchema.pick({
  name: true,
  causeName: true,
  endDateTime: true,
})
  .partial()
  .extend({
    theme: ThemeSchema.partial().optional(),
    scraperSource: ScraperSourceSchema.partial().optional(),
  });
export type UpdateEventInput = z.infer<typeof UpdateEventInputSchema>;
