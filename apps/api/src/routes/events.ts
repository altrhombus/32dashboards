import { Router } from "express";
import { z } from "zod";
import {
  CreateEventInputSchema,
  UpdateEventInputSchema,
  CreateIncentiveInputSchema,
  UpdateIncentiveInputSchema,
  IncentiveStateInputSchema,
  CreateSponsorInputSchema,
  AskMeConfigSchema,
} from "@32dashboards/schema";
import type { DrizzleDb } from "../db/client.js";
import { validateBody } from "../middleware/validateBody.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { broadcastConfigIfActive } from "../lib/broadcast.js";
import { paramString } from "../lib/params.js";
import { pushScraperConfig, type ScraperClientConfig } from "../lib/scraperClient.js";
import {
  listEvents,
  getEventConfig,
  createEvent,
  updateEvent,
  activateEvent,
  updateAnnouncements,
  updateAskMe,
  replaceSponsors,
  createIncentive,
  updateIncentive,
  deleteIncentive,
  setIncentiveState,
} from "../lib/repository.js";

const AnnouncementsInputSchema = z.object({
  announcements: z.array(z.string().max(200)).max(50),
});

const SponsorsInputSchema = z.object({
  sponsors: z.array(CreateSponsorInputSchema),
});

export function createEventsRouter(db: DrizzleDb, scraperConfig: ScraperClientConfig): Router {
  const router = Router();

  /**
   * Best-effort: pushes the active event's scraperSource to the scraper
   * service so activating a different event (or editing its scraperSource)
   * actually retargets scraping without a redeploy. Failures are logged,
   * not thrown -- the scraper being briefly unreachable shouldn't block an
   * otherwise-successful admin edit; the next admin action will retry the push.
   */
  async function maybePushScraperConfig(eventId: string): Promise<void> {
    const event = getEventConfig(db, eventId);
    if (!event || !event.isActive) return;
    try {
      await pushScraperConfig(scraperConfig, event.scraperSource);
    } catch (err) {
      console.error(`failed to push scraper config for event ${eventId}:`, err);
    }
  }

  router.get(
    "/",
    asyncHandler((_req, res) => {
      res.json(listEvents(db));
    })
  );

  router.post(
    "/",
    validateBody(CreateEventInputSchema),
    asyncHandler((req, res) => {
      const event = createEvent(db, req.body);
      res.status(201).json(event);
    })
  );

  router.get(
    "/:id",
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const event = getEventConfig(db, id);
      if (!event) {
        res.status(404).json({ error: `event ${id} not found` });
        return;
      }
      res.json(event);
    })
  );

  router.put(
    "/:id",
    validateBody(UpdateEventInputSchema),
    asyncHandler(async (req, res) => {
      const id = paramString(req, "id");
      const event = updateEvent(db, id, req.body);
      broadcastConfigIfActive(db, id);
      if (req.body.scraperSource) await maybePushScraperConfig(id);
      res.json(event);
    })
  );

  router.post(
    "/:id/activate",
    asyncHandler(async (req, res) => {
      const id = paramString(req, "id");
      const event = activateEvent(db, id);
      broadcastConfigIfActive(db, id);
      await maybePushScraperConfig(id);
      res.json(event);
    })
  );

  router.put(
    "/:id/announcements",
    validateBody(AnnouncementsInputSchema),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const event = updateAnnouncements(db, id, req.body.announcements);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  router.put(
    "/:id/askme",
    validateBody(AskMeConfigSchema.partial()),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const event = updateAskMe(db, id, req.body);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  router.put(
    "/:id/sponsors",
    validateBody(SponsorsInputSchema),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const event = replaceSponsors(db, id, req.body.sponsors);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  router.post(
    "/:id/incentives",
    validateBody(CreateIncentiveInputSchema),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const event = createIncentive(db, id, req.body);
      broadcastConfigIfActive(db, id);
      res.status(201).json(event);
    })
  );

  router.put(
    "/:id/incentives/:incentiveId",
    validateBody(UpdateIncentiveInputSchema),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const incentiveId = paramString(req, "incentiveId");
      const event = updateIncentive(db, id, incentiveId, req.body);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  router.delete(
    "/:id/incentives/:incentiveId",
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const incentiveId = paramString(req, "incentiveId");
      const event = deleteIncentive(db, id, incentiveId);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  router.post(
    "/:id/incentives/:incentiveId/state",
    validateBody(IncentiveStateInputSchema),
    asyncHandler((req, res) => {
      const id = paramString(req, "id");
      const incentiveId = paramString(req, "incentiveId");
      const event = setIncentiveState(db, id, incentiveId, req.body);
      broadcastConfigIfActive(db, id);
      res.json(event);
    })
  );

  return router;
}
