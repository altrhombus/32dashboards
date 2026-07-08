import { z } from "zod";

/**
 * Wire format produced by apps/scraper. picture_url is kept snake_case
 * deliberately -- the one holdover from the legacy scraper's JSON output,
 * everything else in this schema package is camelCase.
 */
export const ScrapedItemSchema = z.object({
  title: z.string().nullable(),
  picture_url: z.string().nullable(),
  price: z.string().nullable(),
  remaining: z.string().nullable(),
  value: z.string().nullable(),
  bids: z.string().nullable(),
});

export type ScrapedItem = z.infer<typeof ScrapedItemSchema>;
