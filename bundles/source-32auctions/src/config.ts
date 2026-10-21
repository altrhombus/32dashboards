import { z } from "zod";

export const SOURCE_ID = "32auctions";
export const DEFAULT_BASE_URL = "https://www.32auctions.com";

/** Per-event settings. The IDs come from the auction's admin URLs. */
export const ConfigSchema = z
  .object({
    orgId: z.string().trim().min(1, "Required"),
    auctionId: z.string().trim().min(1, "Required"),
    /** The public auction path, e.g. "spring-gala-2026" in 32auctions.com/spring-gala-2026. */
    friendlyAuctionPath: z.string().trim().min(1, "Required"),
    refreshIntervalSeconds: z.number().int().min(5).max(3600).default(10),
    /**
     * Where the total comes from:
     * - `page`: the auction's public page (the default);
     * - `bids`: the sum of the items' current bids, for auctions that hide their total;
     * - `none`: nothing; the total comes only from venue cash and other entries, for when the
     *   auction's total shouldn't be shown at all.
     */
    totalFrom: z.enum(["page", "bids", "none"]).default("page"),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Credentials, all optional for public auctions:
 * - `email` and `password`: the organizer account, for signing in automatically;
 * - `sessionCookie` and `authToken`: cookies pasted from a signed-in browser, the fallback.
 */
export const SECRET_KEYS = ["email", "password", "sessionCookie", "authToken"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export const itemsUrl = (base: string, c: Config) =>
  `${base}/organizations/${encodeURIComponent(c.orgId)}/auctions/${encodeURIComponent(c.auctionId)}?r=1&t=all`;
export const summaryUrl = (base: string, c: Config) =>
  `${base}/${c.friendlyAuctionPath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
