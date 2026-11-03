import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./AskMeRoundWrap.css";

export interface AskMeRoundWrapProps {
  /** The round's title, e.g. "Fund a kennel". */
  title: string;
  amount: number;
  /** Where it was in the night's plan (count 0: no plan). */
  number?: number;
  count?: number;
  /** Every Ask Me round tonight; shown after the last planned round. */
  raisedTonight?: number;
}

/**
 * The end of an Ask Me round: what it raised, with thanks and confetti, over
 * whatever is on screen. Between rounds it plays on the Ask Me screen; when
 * the show moves on, it's the transition into the next scene.
 */
export function AskMeRoundWrap({ title, amount, number = 1, count = 0, raisedTonight }: AskMeRoundWrapProps) {
  const last = count > 0 && number >= count;
  return (
    <div className="askme-wrap" role="status">
      <ConfettiBurst active particleCount={220} />
      <div className="askme-wrap__card">
        {count > 0 && (
          <span className="askme-wrap__step">
            Ask Me {number} of {count}
          </span>
        )}
        <span className="askme-wrap__title clamp-1" title={title}>
          {title}
        </span>
        <span className="askme-wrap__lead">raised</span>
        <span className="askme-wrap__amount num">{formatAmount(amount)}</span>
        {last && raisedTonight !== undefined && raisedTonight > amount ? (
          <span className="askme-wrap__thanks">
            Thank you! Ask Me raised <span className="num">{formatAmount(raisedTonight)}</span> tonight.
          </span>
        ) : (
          <span className="askme-wrap__thanks">Thank you!</span>
        )}
      </div>
    </div>
  );
}
