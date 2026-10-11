import type { Prize } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import "./PrizeCard.css";

export interface PrizeCardProps {
  prize: Prize;
}

export function PrizeCard({ prize }: PrizeCardProps) {
  return (
    <div className="prize-card">
      <span className="prize-card__label">Prize</span>
      <span className="prize-card__name clamp-1" title={prize.name}>
        {prize.name}
      </span>
      {prize.minimumDonation !== null && prize.minimumDonation > 0 && (
        <span className="prize-card__minimum num">Give {formatAmount(prize.minimumDonation)}+ to enter</span>
      )}
      {prize.description && (
        <span className="prize-card__description clamp-1" title={prize.description}>
          {prize.description}
        </span>
      )}
    </div>
  );
}
