import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./MilestoneCelebration.css";

export interface MilestoneCelebrationProps {
  /** e.g. "Milestone reached!" or "Incentive met!" */
  heading: string;
  /** The amount, as money; or `text` instead (e.g. "10 minutes left"). */
  amount?: number;
  text?: string;
  /** Default true. */
  confetti?: boolean;
  /** Optional detail, e.g. the milestone label or incentive name. */
  detail?: string;
}

/** A full-width celebration for a milestone or met incentive. */
export function MilestoneCelebration({ heading, amount, text, detail, confetti = true }: MilestoneCelebrationProps) {
  return (
    <div className="milestone-celebration" role="status">
      {confetti && <ConfettiBurst active />}
      <span className="milestone-celebration__heading">{heading}</span>
      <span className="milestone-celebration__amount num">{text ?? formatAmount(amount ?? 0)}</span>
      {detail && (
        <span className="milestone-celebration__detail clamp-1" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}
