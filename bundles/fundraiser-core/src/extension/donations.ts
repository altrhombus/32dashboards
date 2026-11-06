import { roundCents } from "@32dashboards/schema/core";

/*
 * Thanks money the bids don't explain (a donation), without thanking a bid
 * twice. An auction's total and its item list don't always update in the
 * same refresh: the total can rise a refresh before the bid that raised it
 * shows on its item, or the other way round. So unexplained money waits
 * DONATION_GRACE_MS before it's thanked, and bid money the total hasn't
 * caught up with yet cancels it out (and vice versa) in the meantime. A total
 * that drops and comes back isn't new money either, so a rise only counts
 * once it's past where the total was before the drop.
 */

/** How long a rise in the total waits for a bid to explain it before it's thanked. */
export const DONATION_GRACE_MS = 25_000;
/** How long bid money waits for the total to catch up before it's forgotten. */
export const BID_MEMORY_MS = 3 * 60_000;

interface Pending {
  /** Total rises no bid has explained yet, and since when. */
  donation: number;
  donationSince: number | null;
  /** Bid money the total hasn't shown yet, and since when. */
  bidMoney: number;
  bidSince: number | null;
  /** How far the total has dropped, and hasn't yet come back. */
  dropped: number;
}

export class DonationLedger {
  private readonly events = new Map<string, Pending>();

  private for(eventId: string): Pending {
    let p = this.events.get(eventId);
    if (!p)
      this.events.set(eventId, (p = { donation: 0, donationSince: null, bidMoney: 0, bidSince: null, dropped: 0 }));
    return p;
  }

  /** One refresh: how much the total changed, and how much of it the item bids account for. */
  observe(eventId: string, totalDelta: number, fromBids: number, now: number): void {
    const p = this.for(eventId);
    this.expire(p, now);
    if (totalDelta < 0) p.dropped = roundCents(p.dropped + -totalDelta);
    const unexplained = roundCents(totalDelta - fromBids);
    if (unexplained > 0) {
      // A recovery first: money that was already counted before the total dropped.
      const recovered = Math.min(unexplained, p.dropped);
      p.dropped = roundCents(p.dropped - recovered);
      // Then pay off bids seen earlier whose money hadn't shown in the total.
      const settled = Math.min(unexplained - recovered, p.bidMoney);
      p.bidMoney = roundCents(p.bidMoney - settled);
      if (p.bidMoney <= 0) p.bidSince = null;
      const left = roundCents(unexplained - recovered - settled);
      if (left > 0) {
        p.donation = roundCents(p.donation + left);
        p.donationSince ??= now;
      }
    } else if (unexplained < 0) {
      // Bids the total doesn't show yet (only bid money; a drop in the total isn't a bid).
      let early = Math.min(-unexplained, fromBids);
      const settled = Math.min(early, p.donation);
      p.donation = roundCents(p.donation - settled);
      if (p.donation <= 0) p.donationSince = null;
      early = roundCents(early - settled);
      if (early > 0) {
        p.bidMoney = roundCents(p.bidMoney + early);
        p.bidSince ??= now;
      }
    }
  }

  /** Unexplained money that has waited long enough to thank (0 if none); it's then forgotten. */
  due(eventId: string, now: number): number {
    const p = this.events.get(eventId);
    if (!p) return 0;
    this.expire(p, now);
    if (p.donation < 1 || p.donationSince === null || now - p.donationSince < DONATION_GRACE_MS) return 0;
    const amount = p.donation;
    p.donation = 0;
    p.donationSince = null;
    return amount;
  }

  /** When the next thank-you could be due, if one is waiting. */
  nextDue(eventId: string): number | null {
    const p = this.events.get(eventId);
    return p?.donationSince != null && p.donation >= 1 ? p.donationSince + DONATION_GRACE_MS : null;
  }

  private expire(p: Pending, now: number) {
    if (p.bidSince !== null && now - p.bidSince > BID_MEMORY_MS) {
      p.bidMoney = 0;
      p.bidSince = null;
    }
  }
}
