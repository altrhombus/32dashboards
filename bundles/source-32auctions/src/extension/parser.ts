import * as cheerio from "cheerio";

/*
 * 32auctions markup parsing. The selectors are ported verbatim from the
 * legacy Python scraper, which was validated against the real site;
 * changing them risks new scraping bugs. Fixtures in test/fixtures are the
 * same ones the Python tests used.
 */

/** Stop following "next" links after this many pages, cycles or not. */
export const MAX_PAGES = 200;

/** A card as it appears on the page, before normalization. */
export interface ScrapedCard {
  href: string | null;
  title: string | null;
  pictureUrl: string | null;
  price: string | null;
  remaining: string | null;
  value: string | null;
  bids: string | null;
}

/** Thrown when results look like the site's markup changed under us. */
export class ScrapeIntegrityError extends Error {
  override name = "ScrapeIntegrityError";
}

/** Trimmed text of the first match, or null when nothing matches. */
const text = (matches: { length: number; first(): { text(): string } }) =>
  matches.length ? matches.first().text().trim() : null;

export function parseItemsPage(html: string, pageUrl: string): { cards: ScrapedCard[]; nextUrl: string | null } {
  const $ = cheerio.load(html);
  const cards: ScrapedCard[] = [];

  $("a.item").each((_, anchor) => {
    const card = $(anchor).find(".card").first();
    if (!card.length) return;

    const fields: Pick<ScrapedCard, "remaining" | "value" | "bids"> = { remaining: null, value: null, bids: null };
    card.find("div.card-text.small.text-truncate.text-muted").each((_, div) => {
      const line = $(div).text().trim();
      const match = /^(remaining|value|bids):\s*(.*)$/i.exec(line);
      if (match) fields[match[1]!.toLowerCase() as keyof typeof fields] = match[2]!.trim();
    });

    cards.push({
      href: $(anchor).attr("href") ?? null,
      title: text(card.find("h5.text-truncate-2.narrow")) || null,
      pictureUrl: card.find(".img-section img").first().attr("src") ?? null,
      price: text(card.find("h6.text-truncate")),
      ...fields,
    });
  });

  const next = $('ul.pagination li.next a.page-link, ul.pagination li.next a[rel="next"]').first().attr("href");
  return { cards, nextUrl: next ? new URL(next, pageUrl).href : null };
}

/** The raw total-raised text (e.g. "$1,234.56"), or null if the element is missing. */
export function parseTotalRaised(html: string): string | null {
  const $ = cheerio.load(html);
  return text($("div.raised.amt")) || null;
}

/**
 * Throws if every card is missing a title: a strong sign the selectors no
 * longer match, rather than a real auction state. An empty auction is fine.
 */
export function checkIntegrity(cards: ScrapedCard[]): void {
  if (cards.length > 0 && cards.every((card) => !card.title)) {
    throw new ScrapeIntegrityError(
      `All ${cards.length} items are missing a title; the 32auctions page layout has probably changed`,
    );
  }
}
