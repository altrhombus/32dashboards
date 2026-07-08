import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { ScrapeResultInputSchema } from "@32dashboards/schema";
import type { DrizzleDb } from "../db/client.js";
import { validateBody } from "../middleware/validateBody.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getActiveEventConfig, saveScrapeResult } from "../lib/repository.js";
import { broadcastAuctionState } from "../lib/broadcast.js";

function requireInternalToken(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization");
    if (header !== `Bearer ${token}`) {
      res.status(401).json({ error: "invalid internal token" });
      return;
    }
    next();
  };
}

export interface InternalRouterDeps {
  db: DrizzleDb;
  internalToken: string;
}

/**
 * Scraper -> API only. Never exposed on a public port (see infra/nginx and
 * docker-compose: apps/api's host is internal-network-only for this route
 * in practice because the whole api service has no published port).
 */
export function createInternalRouter({ db, internalToken }: InternalRouterDeps): Router {
  const router = Router();

  router.post(
    "/scrape-result",
    requireInternalToken(internalToken),
    validateBody(ScrapeResultInputSchema),
    asyncHandler((req, res) => {
      const active = getActiveEventConfig(db);
      if (!active) {
        res.status(409).json({ error: "no active event to attribute this scrape result to" });
        return;
      }
      const state = saveScrapeResult(db, active.id, req.body);
      broadcastAuctionState(state);
      res.json(state);
    })
  );

  return router;
}
