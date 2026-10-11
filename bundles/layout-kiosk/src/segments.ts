import type { InfoBarSegment } from "@32dashboards/incentive-machine";
import type {
  BidWar,
  Incentive,
  LiveStateReplicant,
  Prize,
  SourceItem,
  Sponsor,
} from "@32dashboards/schema/core";

/*
 * Turns the active event into info bar segments: one per incentive, bid
 * war, prize, announcement, and sponsor, plus the item marquee and the call
 * to action, in the order the event's info bar config lists their kinds.
 * Keys are stable ids, so the rotation keeps its place as data changes.
 */

export type SegmentContent =
  | { kind: "items"; items: SourceItem[] }
  | { kind: "incentive"; incentive: Incentive }
  | { kind: "bidWar"; bidWar: BidWar }
  | { kind: "prize"; prize: Prize }
  | { kind: "callToAction"; text: string }
  | { kind: "announcement"; text: string }
  | { kind: "sponsor"; sponsor: Sponsor };

export type Segment = InfoBarSegment & { content: SegmentContent };

export interface SegmentPlan {
  segments: Segment[];
  /** Kept on screen instead of rotating, e.g. an incentive the operator pinned. */
  pinned: Segment | null;
}

export function buildSegments(live: LiveStateReplicant): SegmentPlan {
  const event = live.event;
  if (!event) return { segments: [], pinned: null };
  const ms = event.infoBar.segmentSeconds * 1000;
  const segments: Segment[] = [];
  const add = (key: string, content: SegmentContent, durationMs = ms) => segments.push({ key, durationMs, content });

  for (const kind of event.infoBar.segments) {
    switch (kind) {
      case "items":
        // The marquee needs longer than a card to show a useful stretch of items.
        if (live.items.length) add("items", { kind: "items", items: live.items }, ms * 2);
        break;
      case "incentives":
        for (const incentive of event.incentives.filter((i) => i.active)) {
          add(`incentive:${incentive.id}`, { kind: "incentive", incentive });
        }
        break;
      case "bidWars":
        for (const bidWar of event.bidWars.filter((w) => w.active && w.options.length >= 2)) {
          add(`bidWar:${bidWar.id}`, { kind: "bidWar", bidWar });
        }
        break;
      case "prizes":
        for (const prize of event.prizes.filter((p) => p.active)) add(`prize:${prize.id}`, { kind: "prize", prize });
        break;
      case "callToAction":
        if (event.callToAction.trim()) add("callToAction", { kind: "callToAction", text: event.callToAction });
        break;
      case "announcements":
        event.announcements.forEach((text, i) => text.trim() && add(`announcement:${i}:${text}`, { kind: "announcement", text }));
        break;
      case "sponsors":
        for (const sponsor of event.sponsors) add(`sponsor:${sponsor.id}`, { kind: "sponsor", sponsor });
        break;
    }
  }

  // Pinned, in priority order: an incentive shown "now", then one shown until it's met.
  const active = event.incentives.filter((i) => i.active);
  const pinnedIncentive =
    active.find((i) => i.displayNow) ?? active.find((i) => i.displayUntilMet && live.total < i.target);
  const pinned: Segment | null = pinnedIncentive
    ? { key: `incentive:${pinnedIncentive.id}`, durationMs: ms, content: { kind: "incentive", incentive: pinnedIncentive } }
    : null;

  return { segments, pinned };
}

/**
 * Items worth featuring: valued items with few bids (the best deals),
 * falling back to every item when none qualify.
 */
export function selectFeaturedItems(items: SourceItem[]): SourceItem[] {
  const deals = items.filter((item) => item.value !== null && (item.bidCount ?? 0) <= 2);
  return deals.length > 0 ? deals : items;
}
