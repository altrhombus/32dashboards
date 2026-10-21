import { formatCurrency } from "@32dashboards/schema/core";
import { fetchText, parseCount, parseMoney, type PollResult } from "@32dashboards/source-sdk";
import { itemsUrl, summaryUrl, type Config } from "../config.js";
import { MAX_PAGES, checkIntegrity, parseItemsPage, parseTotalRaised, type ScrapedCard } from "./parser.js";

export interface ScrapeOptions {
  config: Config;
  secrets: Readonly<Record<string, string>>;
  /** Cookies from an automatic sign-in; used instead of the pasted ones in `secrets`. */
  cookies?: Readonly<Record<string, string>>;
  signal: AbortSignal;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Thrown when the auction page has no total: it's hidden from the public, or we aren't signed in. */
export class TotalNotShownError extends Error {
  override name = "TotalNotShownError";
}

/** The cookies pasted into the panel, as cookie name -> value. */
export function pastedCookies(secrets: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    [
      ["_session_id", secrets.sessionCookie],
      ["auth_token", secrets.authToken],
    ].filter((pair): pair is [string, string] => Boolean(pair[1])),
  );
}

export function cookieHeader(cookies: Readonly<Record<string, string>>): Record<string, string> {
  const pairs = Object.entries(cookies).map(([name, value]) => `${name}=${value}`);
  return pairs.length ? { cookie: pairs.join("; ") } : {};
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
  const headers = cookieHeader(options.cookies ?? pastedCookies(secrets));
  const get = (url: string) => fetchText(url, { headers, signal, fetchImpl, sleep });

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

  const items = normalizeCards(cards);
  const count = `${items.length} item${items.length === 1 ? "" : "s"}`;
  if (config.totalFrom === "none") return { total: 0, items, status: `${count}; the auction's total isn't shown` };
  if (config.totalFrom === "bids") {
    const sum = Math.round(items.reduce((total, item) => total + (item.currentBid ?? 0), 0) * 100) / 100;
    return { total: sum, items, status: `${formatCurrency(sum)} in current bids · ${count}` };
  }

  const totalRaw = parseTotalRaised(await get(summaryUrl(baseUrl, config)));
  const total = parseMoney(totalRaw);
  if (totalRaw === null) {
    throw new TotalNotShownError(
      "The auction page doesn't show the total raised. If the auction hides it from the public, sign in " +
        "(organizer email and password, or pasted cookies, in the 32auctions panel); else check the auction path",
    );
  }
  if (total === null) throw new Error(`Couldn't read the total raised ("${totalRaw}")`);
  return { total, items };
}
