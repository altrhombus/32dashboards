import type { DonationMoment } from "@32dashboards/schema/core";
import { formatAmount } from "../../display/format.js";
import "./MomentToast.css";

export interface MomentToastProps {
  moment: Extract<DonationMoment, { kind: "total-increase" | "new-bid" }>;
}

/** A short "surprise and delight" pop for a new donation or bid. */
export function MomentToast({ moment }: MomentToastProps) {
  return (
    <div className="moment-toast" role="status">
      {moment.kind === "total-increase" ? (
        <>
          <span className="moment-toast__amount num">+{formatAmount(moment.delta)}</span>
          <span className="moment-toast__text">Thank you!</span>
        </>
      ) : (
        <>
          <span className="moment-toast__text">New bid</span>
          <span className="moment-toast__title clamp-1" title={moment.itemTitle}>
            {moment.itemTitle}
          </span>
          {moment.amount !== null && <span className="moment-toast__amount num">{formatAmount(moment.amount)}</span>}
        </>
      )}
    </div>
  );
}
