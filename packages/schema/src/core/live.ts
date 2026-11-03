import type { FundraiserEvent } from "./event.js";
import type { LiveStateReplicant } from "./replicants.js";
import type { SourceItem, SourceResult } from "./source.js";

/** Drops items whose title contains any filter term (case-insensitive). */
export function applyFilters(items: SourceItem[], filters: string[]): { items: SourceItem[]; hidden: number } {
  const terms = filters.map((f) => f.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return { items, hidden: 0 };
  const kept = items.filter((item) => {
    const title = item.title.toLowerCase();
    return !terms.some((term) => title.includes(term));
  });
  return { items: kept, hidden: items.length - kept.length };
}

/**
 * What displays show for an event: its latest source result plus venue cash
 * and finished Ask Me rounds, with hidden items removed. The core uses it for the event on
 * screen (liveState); previews use it for an event being set up.
 */
export function liveStateFor(event: FundraiserEvent | null, result: SourceResult | undefined): LiveStateReplicant {
  const rawTotal = result?.total ?? 0;
  const adjustment = event?.adjustment ?? 0;
  const askMeRaised = event?.askMeRaised ?? 0;
  const { items, hidden } = applyFilters(result?.items ?? [], event?.filters ?? []);
  return {
    event,
    rawTotal,
    adjustment,
    askMeRaised,
    total: Math.round((rawTotal + adjustment + askMeRaised) * 100) / 100,
    items,
    hiddenItemCount: hidden,
    sourceId: result?.sourceId ?? null,
    observedAt: result?.observedAt ?? null,
  };
}
