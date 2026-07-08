import { z } from "zod";

/**
 * sessionCookie/authToken are secrets scoped to admin CRUD only -- they must
 * never be included in the public SSE "config" broadcast. See event.ts's
 * PublicEventConfigSchema, which omits this whole object.
 */
export const ScraperSourceSchema = z.object({
  orgId: z.string().min(1),
  auctionId: z.string().min(1),
  friendlyAuctionPath: z.string().min(1),
  sessionCookie: z.string().nullable().default(null),
  authToken: z.string().nullable().default(null),
  refreshIntervalSeconds: z.number().int().positive().default(10),
  filters: z.array(z.string()).default([]),
});

export type ScraperSource = z.infer<typeof ScraperSourceSchema>;
