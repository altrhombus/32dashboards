import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntegrity, parseItemsPage, parseTotalRaised, ScrapeIntegrityError } from "../src/extension/parser.js";
import { scrapeAuction } from "../src/extension/scrape.js";
import { itemsUrl, summaryUrl, type Config } from "../src/config.js";

// Same fixtures (and assertions) as the legacy Python parser tests.
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const BASE = "https://example.test";
const config: Config = {
  orgId: "org1",
  auctionId: "auc1",
  friendlyAuctionPath: "spring-gala",
  refreshIntervalSeconds: 10,
};

/** Serves canned pages and records requests, like the Python FakeSession. */
function fakeSite(pages: Record<string, string>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (!init?.signal) throw new Error("caller must pass a signal (timeout)");
    if (!(url in pages)) throw new TypeError(`unexpected url requested: ${url}`);
    return new Response(pages[url]);
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

const noSleep = async () => {};
const signal = new AbortController().signal;

describe("parseItemsPage", () => {
  it("parses every field and the next-page link", () => {
    const { cards, nextUrl } = parseItemsPage(fixture("items_page1.html"), `${BASE}/auction`);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      href: "/item/1",
      title: "Signed Guitar",
      pictureUrl: "/images/item1.jpg",
      price: "$50",
      remaining: "2 days",
      value: "$100",
      bids: "3",
    });
    expect(nextUrl).toBe(`${BASE}/auction?page=2`);
  });

  it("has no next page when the link is missing", () => {
    expect(parseItemsPage(fixture("items_page2.html"), `${BASE}/auction`).nextUrl).toBeNull();
  });
});

describe("parseTotalRaised", () => {
  it("reads the amount", () => {
    expect(parseTotalRaised(fixture("summary.html"))).toBe("$1,234.56");
  });

  it("returns null when the element is absent", () => {
    expect(parseTotalRaised("<html><body>no total here</body></html>")).toBeNull();
  });
});

describe("checkIntegrity", () => {
  it("passes healthy and empty results", () => {
    expect(() => checkIntegrity(parseItemsPage(fixture("items_page1.html"), BASE).cards)).not.toThrow();
    expect(() => checkIntegrity([])).not.toThrow();
  });

  it("fails loudly when the markup changed", () => {
    const { cards } = parseItemsPage(fixture("items_page1_mutated.html"), BASE);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.title === null)).toBe(true);
    expect(() => checkIntegrity(cards)).toThrow(ScrapeIntegrityError);
  });
});

describe("scrapeAuction", () => {
  const first = itemsUrl(BASE, config);
  const pages = {
    [first]: fixture("items_page1.html"),
    [`${BASE}/auction?page=2`]: fixture("items_page2.html"),
    [summaryUrl(BASE, config)]: fixture("summary.html"),
  };

  it("follows pagination, normalizes items, and parses the total", async () => {
    const site = fakeSite(pages);
    const result = await scrapeAuction({ config, secrets: {}, signal, baseUrl: BASE, fetchImpl: site.fetchImpl });

    expect(site.requests.map((r) => r.url)).toEqual([first, `${BASE}/auction?page=2`, `${BASE}/spring-gala`]);
    expect(result.total).toBe(1234.56);
    expect(result.items).toHaveLength(3);
    expect(result.items?.[0]).toEqual({
      id: "/item/1",
      title: "Signed Guitar",
      imageUrl: `${BASE}/images/item1.jpg`,
      currentBid: 50,
      value: 100,
      bidCount: 3,
      remaining: "2 days",
    });
    expect(result.items?.[2]?.title).toBe("Weekend Cabin Stay");
  });

  it("sends credentials as cookies", async () => {
    const site = fakeSite(pages);
    await scrapeAuction({
      config,
      secrets: { sessionCookie: "s1", authToken: "a1" },
      signal,
      baseUrl: BASE,
      fetchImpl: site.fetchImpl,
    });
    expect(site.requests[0]?.headers).toEqual({ cookie: "_session_id=s1; auth_token=a1" });
  });

  it("fails instead of reporting $0 when the total is missing", async () => {
    const site = fakeSite({ ...pages, [summaryUrl(BASE, config)]: "<html></html>" });
    await expect(
      scrapeAuction({ config, secrets: {}, signal, baseUrl: BASE, fetchImpl: site.fetchImpl, sleep: noSleep }),
    ).rejects.toThrow(/Total raised not found/);
  });

  it("fails on markup changes", async () => {
    const site = fakeSite({ ...pages, [first]: fixture("items_page1_mutated.html") });
    await expect(
      scrapeAuction({ config, secrets: {}, signal, baseUrl: BASE, fetchImpl: site.fetchImpl }),
    ).rejects.toBeInstanceOf(ScrapeIntegrityError);
  });

  it("stops on a pagination cycle", async () => {
    const loop = fixture("items_page2.html").replace(
      '<ul class="pagination">',
      `<ul class="pagination"><li class="next"><a class="page-link" href="${first}">Next</a></li>`,
    );
    const site = fakeSite({ ...pages, [`${BASE}/auction?page=2`]: loop });
    const result = await scrapeAuction({ config, secrets: {}, signal, baseUrl: BASE, fetchImpl: site.fetchImpl });
    expect(result.items).toHaveLength(3);
  });
});
