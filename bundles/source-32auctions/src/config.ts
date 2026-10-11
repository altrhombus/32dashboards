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
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;

/** Credentials for private auctions, sent as cookies. Both are optional for public auctions. */
export const SECRET_KEYS = ["sessionCookie", "authToken"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export const itemsUrl = (base: string, c: Config) =>
  `${base}/organizations/${encodeURIComponent(c.orgId)}/auctions/${encodeURIComponent(c.auctionId)}?r=1&t=all`;
export const summaryUrl = (base: string, c: Config) =>
  `${base}/${c.friendlyAuctionPath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;
