import { fetchText, parseCount, parseMoney, type PollResult } from "@32dashboards/source-sdk";
import { itemsUrl, summaryUrl, type Config } from "../config.js";
import { MAX_PAGES, checkIntegrity, parseItemsPage, parseTotalRaised, type ScrapedCard } from "./parser.js";

export interface ScrapeOptions {
  config: Config;
  secrets: Readonly<Record<string, string>>;
  signal: AbortSignal;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function cookieHeader(secrets: Readonly<Record<string, string>>): Record<string, string> {
  const cookies = [
    secrets.sessionCookie && `_session_id=${secrets.sessionCookie}`,
    secrets.authToken && `auth_token=${secrets.authToken}`,
  ].filter(Boolean);
  return cookies.length ? { cookie: cookies.join("; ") } : {};
}

/** Turns page cards into SourceItems with stable ids and absolute image URLs. */
export function normalizeCards(cards: { card: ScrapedCard; pageUrl: string }[]) {
  const seen = new Map<string, number>();
  return cards.map(({ card, pageUrl }, index) => {
    // The item link is the stable id; fall back to position for cards without one.
    let id = card.href ? new URL(card.href, pageUrl).pathname : `index-${index}`;
    const dupes = seen.get(id) ?? 0;
    seen.set(id, dupes + 1);
    if (dupes) id = `${id}#${dupes}`;
    return {
      id,
      title: card.title ?? "Untitled",
      imageUrl: card.pictureUrl ? new URL(card.pictureUrl, pageUrl).href : null,
      currentBid: parseMoney(card.price),
      value: parseMoney(card.value),
      bidCount: parseCount(card.bids),
      remaining: card.remaining,
    };
  });
}

/** Scrapes every item page plus the summary page for one auction. */
export async function scrapeAuction(options: ScrapeOptions): Promise<PollResult> {
  const { config, secrets, signal, baseUrl, fetchImpl, sleep } = options;
  const get = (url: string) => fetchText(url, { headers: cookieHeader(secrets), signal, fetchImpl, sleep });

  const cards: { card: ScrapedCard; pageUrl: string }[] = [];
  const seen = new Set<string>();
  let next: string | null = itemsUrl(baseUrl, config);
  while (next && !seen.has(next) && seen.size < MAX_PAGES) {
    const pageUrl: string = next;
    seen.add(pageUrl);
    const page = parseItemsPage(await get(pageUrl), pageUrl);
    cards.push(...page.cards.map((card) => ({ card, pageUrl })));
    next = page.nextUrl;
  }
  checkIntegrity(cards.map((c) => c.card));

  const totalRaw = parseTotalRaised(await get(summaryUrl(baseUrl, config)));
  const total = parseMoney(totalRaw);
  if (total === null) {
    throw new Error(
      totalRaw === null
        ? "Total raised not found on the auction page; check the auction path, or the page layout has changed"
        : `Couldn't read the total raised ("${totalRaw}")`,
    );
  }
  return { total, items: normalizeCards(cards) };
}
