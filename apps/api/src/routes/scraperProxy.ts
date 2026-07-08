import { Router } from "express";
import { z } from "zod";
import { getEventConfig } from "../lib/repository.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { proxyToScraper, type ScraperClientConfig } from "../lib/scraperClient.js";
import { validateBody } from "../middleware/validateBody.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { paramString } from "../lib/params.js";
import type { DrizzleDb } from "../db/client.js";

const RefreshInputSchema = z.object({ state: z.enum(["pause", "resume", "now"]) });
const FiltersInputSchema = z.object({ keywords: z.array(z.string()) });
const AdjustmentInputSchema = z.object({ amount: z.number() });

/**
 * Proxies admin scraper-control actions through to apps/scraper's internal
 * HTTP API, which has no public port -- only reachable from apps/api on the
 * compose network. Only the currently active event's scraper actions are
 * meaningful, since there is exactly one running scraper process.
 */
export function createScraperProxyRouter(db: DrizzleDb, scraperConfig: ScraperClientConfig): Router {
  const router = Router({ mergeParams: true });

  function assertIsActiveEvent(eventId: string): void {
    const event = getEventConfig(db, eventId);
    if (!event) throw new NotFoundError(`event ${eventId} not found`);
    if (!event.isActive) throw new ConflictError(`event ${eventId} is not the active event -- no scraper is tracking it`);
  }

  router.post(
    "/refresh",
    validateBody(RefreshInputSchema),
    asyncHandler(async (req, res) => {
      assertIsActiveEvent(paramString(req, "id"));
      const upstream = await proxyToScraper(scraperConfig, "/refresh", {
        method: "POST",
        body: JSON.stringify(req.body),
      });
      res.status(upstream.status).json(await upstream.json());
    })
  );

  router.post(
    "/filters",
    validateBody(FiltersInputSchema),
    asyncHandler(async (req, res) => {
      assertIsActiveEvent(paramString(req, "id"));
      const upstream = await proxyToScraper(scraperConfig, "/filters", {
        method: "POST",
        body: JSON.stringify(req.body),
      });
      res.status(upstream.status).json(await upstream.json());
    })
  );

  router.post(
    "/adjustment",
    validateBody(AdjustmentInputSchema),
    asyncHandler(async (req, res) => {
      assertIsActiveEvent(paramString(req, "id"));
      const upstream = await proxyToScraper(scraperConfig, "/adjustment", {
        method: "POST",
        body: JSON.stringify(req.body),
      });
      res.status(upstream.status).json(await upstream.json());
    })
  );

  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      assertIsActiveEvent(paramString(req, "id"));
      const upstream = await proxyToScraper(scraperConfig, "/status");
      res.status(upstream.status).json(await upstream.json());
    })
  );

  return router;
}
