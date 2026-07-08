import { z } from "zod";
import { ScrapedItemSchema } from "./item.js";

export const AuctionStateSchema = z.object({
  eventId: z.string().uuid(),
  totalRaised: z.number(),
  totalRaisedDisplay: z.string(),
  items: z.array(ScrapedItemSchema),
  refreshedAt: z.string().datetime(),
  sourceUrl: z.string().url().nullable(),
});

export type AuctionState = z.infer<typeof AuctionStateSchema>;

/**
 * What apps/scraper POSTs to /internal/scrape-result. totalRaisedRaw is the
 * unparsed display string straight off the page (e.g. "$12,345.67"); the API
 * is the single place that parses it into AuctionState.totalRaised.
 */
export const ScrapeResultInputSchema = z.object({
  items: z.array(ScrapedItemSchema),
  totalRaisedRaw: z.string().nullable(),
  refreshedAt: z.string().datetime(),
  sourceUrl: z.string().url().nullable(),
});
export type ScrapeResultInput = z.infer<typeof ScrapeResultInputSchema>;
