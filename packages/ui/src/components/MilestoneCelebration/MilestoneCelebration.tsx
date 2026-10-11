import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./MilestoneCelebration.css";

export interface MilestoneCelebrationProps {
  /** e.g. "Milestone reached!" or "Incentive met!" */
  heading: string;
  amount: number;
  /** Optional detail, e.g. the milestone label or incentive name. */
  detail?: string;
}

/** A full-width celebration for a milestone or met incentive. */
export function MilestoneCelebration({ heading, amount, detail }: MilestoneCelebrationProps) {
  return (
    <div className="milestone-celebration" role="status">
      <ConfettiBurst active />
      <span className="milestone-celebration__heading">{heading}</span>
      <span className="milestone-celebration__amount num">{formatAmount(amount)}</span>
      {detail && (
        <span className="milestone-celebration__detail clamp-1" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}
