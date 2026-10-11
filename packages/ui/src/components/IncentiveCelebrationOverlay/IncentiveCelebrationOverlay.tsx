import type { Incentive } from "@32dashboards/schema";
import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./IncentiveCelebrationOverlay.css";

export interface IncentiveCelebrationOverlayProps {
  incentive: Incentive;
  stage: "message" | "detail";
}

export function IncentiveCelebrationOverlay({ incentive, stage }: IncentiveCelebrationOverlayProps) {
  return (
    <div className="incentive-celebration-overlay">
      <ConfettiBurst active />
      {stage === "message" ? (
        <div className="incentive-celebration-overlay__stage">
          <span className="incentive-celebration-overlay__title">Incentive Met!</span>
          <span className="incentive-celebration-overlay__subtitle">Thank you!</span>
        </div>
      ) : (
        <div className="incentive-celebration-overlay__stage">
          <span className="incentive-celebration-overlay__name">{incentive.name}</span>
          <span className="incentive-celebration-overlay__amount">{formatAmount(incentive.target)}</span>
        </div>
      )}
    </div>
  );
}
