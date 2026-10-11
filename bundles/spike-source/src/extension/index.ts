import type NodeCG from "nodecg/types";
import type { FundraiserCoreApi } from "fundraiser-core";

const SOURCE_ID = "spike-fake";
const INTERVAL_MS = 5000;
const TITLES = ["Gift Basket", "Signed Jersey", "Weekend Getaway", "Raffle Ticket Bundle", "Wine Tasting for Six"];

/**
 * Pretends donations arrive every few seconds, for whichever active event
 * has `spike-fake` as its source. Proves the adapter path: a separate bundle
 * registers with fundraiser-core through its extension API and reports raw
 * observations, never touching core state directly.
 */
export default function spikeSource(nodecg: NodeCG.ServerAPI) {
  const core = nodecg.extensions["fundraiser-core"] as FundraiserCoreApi | undefined;
  if (!core) throw new Error("fundraiser-core extension is not loaded");

  const source = core.registerSource(SOURCE_ID);
  const totals = new Map<string, number>();

  setInterval(() => {
    const eventId = core.getActiveEventId();
    if (!eventId || core.getEvent(eventId)?.source.adapterId !== SOURCE_ID) return;

    const total = (totals.get(eventId) ?? 0) + 5 + Math.round(Math.random() * 50);
    totals.set(eventId, total);
    source.report({
      eventId,
      total,
      observedAt: new Date().toISOString(),
      items: TITLES.map((title, i) => ({ id: `item-${i}`, title, currentBid: Math.round(total / (i + 2)) })),
    });
  }, INTERVAL_MS);
}
