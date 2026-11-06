import { useEffect, useState } from "react";
import type { DonationMoment } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import "./RecentDonations.css";

export type RecentMoment = Extract<DonationMoment, { kind: "total-increase" | "new-bid" }>;

export interface RecentDonationsProps {
  /** Newest first. */
  moments: RecentMoment[];
  /** Shown before the row, e.g. "Bids". */
  label?: string;
}

/** "just now", "4 min ago", "1 hr ago": rough, so it reads at a glance. */
export function timeAgo(at: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

/**
 * The latest bids and donations in a row, newest on the left: a new one
 * slides in and pushes the rest along, and the oldest fall off the end.
 * Each shows what (the item, or a thank-you) over how much and how long
 * ago. Nothing scrolls, so each stays readable while it's on screen.
 */
export function RecentDonations({ moments, label = "Bids" }: RecentDonationsProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="recent-donations">
      <span className="recent-donations__label">{label}</span>
      <div className="recent-donations__row">
        {moments.length === 0 && (
          <span className="recent-donations__empty">New bids will show here as they come in</span>
        )}
        {moments.map((m) => (
          // key: each one slides in once, when it arrives
          <span key={m.id} className="recent-donations__chip">
            <span className="recent-donations__title clamp-1">
              {m.kind === "new-bid" ? m.itemTitle || "An item" : "Thank you!"}
            </span>
            <span className="recent-donations__meta">
              {m.kind === "new-bid" ? (
                m.amount !== null && <span className="recent-donations__amount num">{formatAmount(m.amount)}</span>
              ) : (
                <span className="recent-donations__amount num">+{formatAmount(m.delta)}</span>
              )}
              {m.kind === "new-bid" && m.purchase && <span>{m.newBids} bought</span>}
              {m.kind === "new-bid" && !m.purchase && m.newBids > 1 && <span>{m.newBids} bids</span>}
              <span className="recent-donations__ago">{timeAgo(m.at, now)}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
