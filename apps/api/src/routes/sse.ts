import { Router } from "express";
import { toPublicEventConfig, type SseEvent } from "@32dashboards/schema";
import type { DrizzleDb } from "../db/client.js";
import { auctionEventBus } from "../pubsub.js";
import { getActiveEventConfig, getAuctionState } from "../lib/repository.js";

const PING_INTERVAL_MS = 15_000;

function writeSseEvent(res: import("express").Response, event: SseEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Public, unauthenticated push stream consumed by apps/display. Sends the
 * active event's config + last known auction state on connect, then
 * forwards subsequent broadcasts plus a 15s heartbeat so proxies/browsers
 * don't time out an idle connection.
 */
export function createSseRouter(db: DrizzleDb): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const active = getActiveEventConfig(db);
    if (active) {
      writeSseEvent(res, { type: "config", data: toPublicEventConfig(active) });
      const state = getAuctionState(db, active.id);
      if (state) {
        writeSseEvent(res, { type: "auction-state", data: state });
      }
    }

    const unsubscribe = auctionEventBus.subscribe((event) => writeSseEvent(res, event));

    const pingInterval = setInterval(() => {
      writeSseEvent(res, { type: "ping", data: { at: new Date().toISOString() } });
    }, PING_INTERVAL_MS);

    req.on("close", () => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  });

  return router;
}
