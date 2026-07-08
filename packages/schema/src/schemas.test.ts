import { describe, expect, it } from "vitest";
import {
  EventConfigSchema,
  PublicEventConfigSchema,
  toPublicEventConfig,
  IncentiveSchema,
  ScrapedItemSchema,
  ScrapeResultInputSchema,
  type EventConfig,
} from "./index.js";

const validIncentive = {
  id: "8c1f2a4e-1b2c-4d3e-9f5a-1234567890ab",
  name: "Match the next $500",
  target: 500,
  active: true,
  displayNow: false,
  displayUntilMet: true,
};

const validEvent: EventConfig = {
  id: "8c1f2a4e-1b2c-4d3e-9f5a-0987654321ab",
  slug: "spring-2026",
  isActive: true,
  name: "Spring Auction 2026",
  causeName: "Local Animal Shelter",
  endDateTime: "2026-04-01T00:00:00.000Z",
  theme: {
    accentColor: "#ffd700",
    secondaryColor: "#4dd0e1",
    backgroundFrom: "#181c2a",
    backgroundTo: "#23284a",
    logoUrl: null,
    fontDisplay: "Montserrat",
    fontMono: "Share Tech Mono",
  },
  announcements: ["Doors open at 6pm"],
  askMe: { enabled: false, title: "Ask Me Spotlight", message: "", total: 0 },
  incentives: [validIncentive],
  sponsors: [],
  scraperSource: {
    orgId: "org123",
    auctionId: "auc456",
    friendlyAuctionPath: "my-auction",
    sessionCookie: "secret-session",
    authToken: "secret-token",
    refreshIntervalSeconds: 10,
    filters: [],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("IncentiveSchema", () => {
  it("accepts a valid incentive", () => {
    expect(IncentiveSchema.parse(validIncentive)).toEqual(validIncentive);
  });

  it("rejects a negative target", () => {
    expect(() => IncentiveSchema.parse({ ...validIncentive, target: -1 })).toThrow();
  });

  it("rejects a name over 200 chars", () => {
    expect(() => IncentiveSchema.parse({ ...validIncentive, name: "x".repeat(201) })).toThrow();
  });
});

describe("ScrapedItemSchema", () => {
  it("accepts nulls for every field except the object itself", () => {
    const item = { title: null, picture_url: null, price: null, remaining: null, value: null, bids: null };
    expect(ScrapedItemSchema.parse(item)).toEqual(item);
  });
});

describe("EventConfigSchema / PublicEventConfigSchema", () => {
  it("accepts a fully populated event", () => {
    expect(EventConfigSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("toPublicEventConfig strips scraperSource secrets", () => {
    const publicConfig = toPublicEventConfig(validEvent);
    expect(publicConfig).not.toHaveProperty("scraperSource");
    expect(PublicEventConfigSchema.parse(publicConfig)).toEqual(publicConfig);
  });
});

describe("ScrapeResultInputSchema", () => {
  it("accepts a typical scrape result payload", () => {
    const payload = {
      items: [{ title: "Gift Basket", picture_url: null, price: "$25", remaining: "2 days", value: "$40", bids: "1" }],
      totalRaisedRaw: "$12,345.67",
      refreshedAt: "2026-01-01T00:00:00.000Z",
      sourceUrl: "https://www.32auctions.com/my-auction",
    };
    expect(ScrapeResultInputSchema.parse(payload)).toEqual(payload);
  });
});
