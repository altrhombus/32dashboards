import type { DrizzleDb } from "../db/client.js";
import { toPublicEventConfig, type AuctionState } from "@32dashboards/schema";
import { auctionEventBus } from "../pubsub.js";
import { getActiveEventConfig } from "./repository.js";

/**
 * Publishes the "config" SSE event only if the mutated event is the
 * currently active one -- displays only ever show the active event, so
 * mutating a dormant/archived event should not push anything to a browser.
 */
export function broadcastConfigIfActive(db: DrizzleDb, mutatedEventId: string): void {
  const active = getActiveEventConfig(db);
  if (active && active.id === mutatedEventId) {
    auctionEventBus.publish({ type: "config", data: toPublicEventConfig(active) });
  }
}

export function broadcastAuctionState(state: AuctionState): void {
  auctionEventBus.publish({ type: "auction-state", data: state });
}
