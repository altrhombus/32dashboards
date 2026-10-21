import { formatTotal } from "../../display/format.js";
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
      {/* Keeps falling for as long as the thank-you is on screen. */}
      <ConfettiBurst active continuous particleCount={220} />
      <div className="grand-celebration-overlay__message">
        <h1>Thank you</h1>
        <h2>
          for helping raise <span className="num">{formatTotal(totalRaised)}</span>
          {causeName ? ` for ${causeName}` : ""}!
        </h2>
      </div>
    </div>
  );
}
