import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LookupError, lookupAuction, parseAuctionPage, publicPathFrom } from "../src/extension/lookup.js";

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const BASE = "https://example.test";

describe("publicPathFrom", () => {
  it.each([
    ["https://www.32auctions.com/SpringGala2026", "SpringGala2026"],
    ["32auctions.com/SpringGala2026/", "SpringGala2026"],
    ["http://32auctions.com/SpringGala2026?ref=email#items", "SpringGala2026"],
    ["  SpringGala2026 ", "SpringGala2026"],
  ])("reads %s", (input, expected) => {
    expect(publicPathFrom(input)).toBe(expected);
  });

  it("explains the organizer's link and other wrong input", () => {
    expect(() => publicPathFrom("https://www.32auctions.com/organizations/1/auctions/2")).toThrow(/organizer's link/);
    expect(() => publicPathFrom("")).toThrow(LookupError);
    expect(() => publicPathFrom("not a link!")).toThrow(/doesn't look like a 32auctions link/);
  });
});

describe("parseAuctionPage", () => {
  it("finds the ids, the auction's title, and the organization's name and logo", () => {
    expect(parseAuctionPage(fixture("auction_summary_2025.html"), `${BASE}/SpringGala2026`)).toEqual({
      orgId: "4242",
      auctionId: "9001",
      title: "Spring Gala 2026 - Auction for the Shelter",
      organizationName: "Riverside Animal Shelter",
      logoUrl: "https://assets.example.test/pics/111/shelter_logo_s550.jpg?v=1",
    });
  });

  it("returns null for a page that isn't an auction", () => {
    expect(parseAuctionPage("<html><title>Not found</title></html>", BASE)).toBeNull();
  });
});

describe("lookupAuction", () => {
  const fetchImpl = (async (url: string) =>
    url === `${BASE}/SpringGala2026`
      ? new Response(fixture("auction_summary_2025.html"))
      : new Response("nope", { status: 404 })) as unknown as typeof fetch;

  it("looks up a pasted link", async () => {
    await expect(lookupAuction("32auctions.com/SpringGala2026", { baseUrl: BASE, fetchImpl })).resolves.toMatchObject({
      friendlyAuctionPath: "SpringGala2026",
      orgId: "4242",
      auctionId: "9001",
    });
  });

  it("says when there's no such auction", async () => {
    await expect(lookupAuction("NoSuchAuction", { baseUrl: BASE, fetchImpl })).rejects.toThrow(/no auction at/);
  });
});
