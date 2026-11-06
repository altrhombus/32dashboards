import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./MilestoneSpotlight.css";

export interface MilestoneSpotlightProps {
  /** e.g. "Milestone reached" or "Goal met" */
  heading: string;
  /** The amount, as money; or `text` instead (e.g. "10 minutes left"). */
  amount?: number;
  text?: string;
  /** Default true. */
  confetti?: boolean;
  /** The milestone's label or the goal's name, if any. */
  detail?: string;
}

/**
 * A milestone, big enough for the whole room: fills the screen for a few
 * seconds, over a dimmed scene, with confetti. Whoever shows it decides how
 * long (the kiosk shows it while the info bar celebrates).
 */
export function MilestoneSpotlight({ heading, amount, text, detail, confetti = true }: MilestoneSpotlightProps) {
  return (
    <div className="milestone-spotlight" role="status">
      {confetti && <ConfettiBurst active particleCount={200} />}
      <div className="milestone-spotlight__card">
        <span className="milestone-spotlight__heading">{heading}</span>
        <span className="milestone-spotlight__amount num">{text ?? formatAmount(amount ?? 0)}</span>
        {detail && (
          <span className="milestone-spotlight__detail clamp-2" title={detail}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}
