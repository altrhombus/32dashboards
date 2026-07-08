import { formatCurrency } from "@32dashboards/schema";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber.js";
import "./TotalRaisedCounter.css";

export interface TotalRaisedCounterProps {
  total: number;
  causeName: string;
}

export function TotalRaisedCounter({ total, causeName }: TotalRaisedCounterProps) {
  const animatedTotal = useAnimatedNumber(total);

  return (
    <div className="total-raised-counter">
      <span className="total-raised-counter__amount">{formatCurrency(animatedTotal)}</span>
      {causeName && <span className="total-raised-counter__subtext">total raised for {causeName}</span>}
    </div>
  );
}
