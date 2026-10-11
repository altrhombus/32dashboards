import type { Incentive } from "@32dashboards/schema";
import { formatAmount, formatTotal } from "../../display/format.js";
import "./IncentiveTracker.css";

export interface IncentiveTrackerProps {
  incentive: Incentive;
  totalRaised: number;
}

export function IncentiveTracker({ incentive, totalRaised }: IncentiveTrackerProps) {
  const progress = incentive.target > 0 ? Math.min(totalRaised / incentive.target, 1) : 0;

  return (
    <div className="incentive-tracker">
      <div className="incentive-tracker__header">
        <span className="incentive-tracker__name clamp-1" title={incentive.name}>
          {incentive.name}
        </span>
        <span className="incentive-tracker__amounts num">
          {formatTotal(totalRaised)} / {formatAmount(incentive.target)}
        </span>
      </div>
      <div className="incentive-tracker__bar">
        <div className="incentive-tracker__bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
