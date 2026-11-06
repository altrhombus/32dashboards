import type { DonationMoment } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import "./RecentDonations.css";

export type RecentMoment = Extract<DonationMoment, { kind: "total-increase" | "new-bid" }>;

export interface RecentDonationsProps {
  /** Newest first. */
  moments: RecentMoment[];
  /** Shown before the row, e.g. "Latest bids". */
  label?: string;
}

/**
 * The latest bids and donations in a row, newest on the left: a new one
 * slides in and pushes the rest along, and the oldest fall off the end.
 * Nothing scrolls, so each stays readable while it's on screen.
 */
export function RecentDonations({ moments, label = "Latest" }: RecentDonationsProps) {
  return (
    <div className="recent-donations">
      <span className="recent-donations__label">{label}</span>
      <div className="recent-donations__row">
        {moments.map((m) => (
          // key: each one slides in once, when it arrives
          <span key={m.id} className="recent-donations__chip">
            {m.kind === "new-bid" ? (
              <>
                <span className="recent-donations__title clamp-1">{m.itemTitle || "An item"}</span>
                {m.amount !== null && <span className="recent-donations__amount num">{formatAmount(m.amount)}</span>}
                {m.newBids > 1 && <span className="recent-donations__count">×{m.newBids}</span>}
              </>
            ) : (
              <>
                <span className="recent-donations__amount num">+{formatAmount(m.delta)}</span>
                <span className="recent-donations__title">Thank you!</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
