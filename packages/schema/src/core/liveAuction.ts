import type { FundraiserEvent, LiveLot } from "./event.js";

/** Whether an item's turn is over: sold, or passed without a sale. */
export const lotFinished = (lot: LiveLot) => lot.soldFor !== null || lot.passed;

/** What the live auction has sold. */
export function liveRaised(event: Pick<FundraiserEvent, "liveLots">): number {
  return Math.round(event.liveLots.reduce((sum, lot) => sum + (lot.soldFor ?? 0), 0) * 100) / 100;
}

/** Where the live auction is: the item up now, and how it fits the list. */
export interface LiveProgress {
  count: number;
  /** 1-based number of the item up now. */
  number: number;
  lot: LiveLot | null;
  next: LiveLot | null;
  /** Every item has had its turn. */
  done: boolean;
}

export function liveProgress(event: Pick<FundraiserEvent, "liveLots" | "liveCurrent">): LiveProgress {
  const count = event.liveLots.length;
  const index = Math.min(event.liveCurrent, count);
  return {
    count,
    number: index + 1,
    lot: event.liveLots[index] ?? null,
    next: event.liveLots[index + 1] ?? null,
    done: count > 0 && index >= count,
  };
}
