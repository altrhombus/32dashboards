import type { ScraperSource } from "@32dashboards/schema";

export interface ScraperClientConfig {
  baseUrl: string;
  controlToken: string;
}

async function scraperFetch(config: ScraperClientConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.controlToken}`,
      ...init.headers,
    },
  });
}

/**
 * Pushes an event's scraperSource to the scraper's runtime config -- this
 * is what makes "activate a different event" actually retarget scraping
 * without a redeploy. Called from routes/events.ts on activate and on any
 * scraperSource update to the active event.
 */
export async function pushScraperConfig(config: ScraperClientConfig, source: ScraperSource): Promise<void> {
  const res = await scraperFetch(config, "/config", {
    method: "POST",
    body: JSON.stringify({
      orgId: source.orgId,
      auctionId: source.auctionId,
      friendlyAuctionPath: source.friendlyAuctionPath,
      sessionCookie: source.sessionCookie,
      authToken: source.authToken,
      refreshIntervalSeconds: source.refreshIntervalSeconds,
      filters: source.filters,
    }),
  });
  if (!res.ok) {
    throw new Error(`scraper /config push failed: ${res.status} ${await res.text()}`);
  }
}

/** Forwards an admin scraper-control action straight through to the scraper's own API. */
export async function proxyToScraper(
  config: ScraperClientConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return scraperFetch(config, path, init);
}
