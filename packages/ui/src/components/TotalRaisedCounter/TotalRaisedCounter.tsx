import { formatTotal } from "../../display/format.js";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber.js";
import "./TotalRaisedCounter.css";

export interface TotalRaisedCounterProps {
  total: number;
  causeName: string;
  /** `hero` is the dominant element of a layout; `compact` fits a bar. */
  variant?: "hero" | "compact";
}

/** The top of the information hierarchy: whole dollars, tabular figures, animated between values. */
export function TotalRaisedCounter({ total, causeName, variant = "compact" }: TotalRaisedCounterProps) {
  const animatedTotal = useAnimatedNumber(total);

  return (
    <div className={`total-raised-counter total-raised-counter--${variant}`}>
      <span className="total-raised-counter__amount num">{formatTotal(animatedTotal)}</span>
      {causeName && (
        <span className="total-raised-counter__subtext clamp-1" title={causeName}>
          raised for {causeName}
        </span>
      )}
    </div>
  );
}
