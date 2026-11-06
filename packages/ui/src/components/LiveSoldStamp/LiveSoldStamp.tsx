import { formatAmount } from "../../display/format.js";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./LiveSoldStamp.css";

export interface LiveSoldStampProps {
  title: string;
  amount: number;
  /** The winner's paddle number, if the operator gave one. */
  paddle?: string;
  imageUrl?: string | null;
}

/** The payoff: SOLD slams down over the item, with the final price. */
export function LiveSoldStamp({ title, amount, paddle, imageUrl }: LiveSoldStampProps) {
  return (
    <div className="live-sold" role="status">
      <ConfettiBurst active particleCount={240} />
      <div className="live-sold__card">
        {imageUrl && <img className="live-sold__image" src={imageUrl} alt="" />}
        <span className="live-sold__stamp">Sold!</span>
        <span className="live-sold__title clamp-2" title={title}>
          {title}
        </span>
        <span className="live-sold__amount num">{formatAmount(amount)}</span>
        {paddle && <span className="live-sold__paddle">Paddle {paddle}</span>}
        <span className="live-sold__thanks">Thank you!</span>
      </div>
    </div>
  );
}
