import { useCallback, useState } from "react";
import { useSSE, type SseStatus } from "@32dashboards/ui";
import type { AuctionState, PublicEventConfig, SseEvent } from "@32dashboards/schema";

export interface LiveAuctionState {
  config: PublicEventConfig | null;
  auctionState: AuctionState | null;
  connectionStatus: SseStatus;
}

/** Composes the generic useSSE transport with this app's specific event shapes. */
export function useLiveAuctionState(sseUrl: string): LiveAuctionState {
  const [config, setConfig] = useState<PublicEventConfig | null>(null);
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);

  const handleEvent = useCallback((event: SseEvent) => {
    if (event.type === "config") {
      setConfig(event.data);
    } else if (event.type === "auction-state") {
      setAuctionState(event.data);
    }
    // "ping" is a heartbeat only -- nothing to store.
  }, []);

  const connectionStatus = useSSE(sseUrl, handleEvent);

  return { config, auctionState, connectionStatus };
}
