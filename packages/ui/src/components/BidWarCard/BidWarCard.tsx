import type { BidWar } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import "./BidWarCard.css";

export interface BidWarCardProps {
  bidWar: BidWar;
}

/** Options side by side as bars, leader highlighted. Ties have no leader. */
export function BidWarCard({ bidWar }: BidWarCardProps) {
  const max = Math.max(0, ...bidWar.options.map((o) => o.total));
  const leaders = bidWar.options.filter((o) => o.total === max && max > 0);
  const leaderId = leaders.length === 1 ? leaders[0]!.id : null;

  return (
    <div className="bid-war-card">
      <div className="bid-war-card__name clamp-1" title={bidWar.name}>
        {bidWar.name}
      </div>
      <div className="bid-war-card__options">
        {bidWar.options.map((option) => (
          <div
            key={option.id}
            className={`bid-war-card__option${option.id === leaderId ? " bid-war-card__option--leader" : ""}`}
          >
            <span className="bid-war-card__option-name clamp-1" title={option.name}>
              {option.name}
            </span>
            <span className="bid-war-card__bar">
              <span
                className="bid-war-card__bar-fill"
                style={{ width: `${max > 0 ? (option.total / max) * 100 : 0}%` }}
              />
            </span>
            <span className="bid-war-card__option-total num">{formatAmount(option.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
