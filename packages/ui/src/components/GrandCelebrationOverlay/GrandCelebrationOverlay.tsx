import { formatCurrency } from "@32dashboards/schema";
import { ConfettiBurst } from "../ConfettiBurst/ConfettiBurst.js";
import "./GrandCelebrationOverlay.css";

export interface GrandCelebrationOverlayProps {
  active: boolean;
  totalRaised: number;
  causeName: string;
}

export function GrandCelebrationOverlay({ active, totalRaised, causeName }: GrandCelebrationOverlayProps) {
  if (!active) return null;

  return (
    <div className="grand-celebration-overlay">
      <ConfettiBurst active particleCount={220} />
      <div className="grand-celebration-overlay__message">
        <h1>Thank you</h1>
        <h2>
          for helping raise {formatCurrency(totalRaised)} for {causeName}!
        </h2>
      </div>
    </div>
  );
}
