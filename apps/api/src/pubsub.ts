import { EventEmitter } from "node:events";
import type { SseEvent } from "@32dashboards/schema";

/**
 * In-process pub/sub for the SSE broadcast (GET /events). This is a
 * one-process-per-deployment system, so a single EventEmitter is sufficient
 * -- no Redis/cross-node pub/sub layer needed.
 */
class AuctionEventBus extends EventEmitter {
  publish(event: SseEvent): void {
    this.emit("broadcast", event);
  }

  subscribe(listener: (event: SseEvent) => void): () => void {
    this.on("broadcast", listener);
    return () => this.off("broadcast", listener);
  }
}

export const auctionEventBus = new AuctionEventBus();
auctionEventBus.setMaxListeners(0);
