import * as cheerio from "cheerio";
import { fetchText } from "@32dashboards/source-sdk";

/*
 * Turns the link people actually have (the public auction link they share
 * with bidders) into the source's settings, plus what the page says about the
 * auction: its title, and the organization's name and logo, which setting up
 * an event can offer as the cause and the logo.
 */

export interface AuctionLookup {
  friendlyAuctionPath: string;
  orgId: string;
  auctionId: string;
  title: string | null;
  organizationName: string | null;
  logoUrl: string | null;
}

/** Thrown with a message for the person who pasted the link. */
export class LookupError extends Error {
  override name = "LookupError";
}

/** "https://www.32auctions.com/SpringGala?x=1" or "SpringGala" -> "SpringGala". */
export function publicPathFrom(input: string): string {
  const text = input.trim();
  if (!text) throw new LookupError("Paste the auction's link.");
  if (/\/organizations\/\d+\/auctions\/\d+/.test(text)) {
    throw new LookupError(
      "That's the organizer's link. Paste the public auction link instead: the one you share with bidders.",
    );
  }
  let path = text;
  if (/^(https?:\/\/)?(www\.)?32auctions\.com/i.test(text)) {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    path = url.pathname;
  }
  const segment = path.replace(/^\/+|\/+$/g, "").split(/[/?#]/)[0] ?? "";
  if (!/^[\w-]{2,100}$/.test(segment)) {
    throw new LookupError("That doesn't look like a 32auctions link, like 32auctions.com/YourAuction.");
  }
  return segment;
}

/** Reads the ids, title, and organization from an auction's public page. */
export function parseAuctionPage(html: string, pageUrl: string): Omit<AuctionLookup, "friendlyAuctionPath"> | null {
  const ids = /\/organizations\/(\d+)\/auctions\/(\d+)/.exec(html);
  if (!ids) return null;
  const $ = cheerio.load(html);
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const title = ogTitle || $("title").first().text().split("|")[0]?.trim() || null;
  // The organization's picture: a hosted picture that isn't an item card (those are "_s300" thumbnails).
  const logo = $("img")
    .toArray()
    .map((img) => ({ src: $(img).attr("src") ?? "", alt: $(img).attr("alt")?.trim() ?? "" }))
    .find(({ src }) => /\/pics\//.test(src) && !/_s300\./.test(src));
  return {
    orgId: ids[1]!,
    auctionId: ids[2]!,
    title,
    organizationName: logo?.alt || null,
    logoUrl: logo ? new URL(logo.src, pageUrl).href : null,
  };
}

export async function lookupAuction(
  input: string,
  options: { baseUrl: string; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<AuctionLookup> {
  const friendlyAuctionPath = publicPathFrom(input);
  const pageUrl = `${options.baseUrl}/${encodeURIComponent(friendlyAuctionPath)}`;
  let html: string;
  try {
    html = await fetchText(pageUrl, { fetchImpl: options.fetchImpl, signal: options.signal });
  } catch (err) {
    const status = (err as { status?: number }).status;
    throw new LookupError(
      status === 404
        ? `There's no auction at 32auctions.com/${friendlyAuctionPath}. Check the link.`
        : `Couldn't reach 32auctions (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  const found = parseAuctionPage(html, pageUrl);
  if (!found) {
    throw new LookupError(
      `32auctions.com/${friendlyAuctionPath} doesn't look like an auction page. Check the link, or enter the details by hand.`,
    );
  }
  return { friendlyAuctionPath, ...found };
}
