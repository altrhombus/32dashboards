import { useEffect, useState } from "react";
import type { Sponsor } from "@32dashboards/schema";
import { durations } from "../../tokens/tokens.js";
import "./SponsorCarousel.css";

export interface SponsorCarouselProps {
  sponsors: Sponsor[];
  intervalMs?: number;
}

/** Unlike legacy (loaded once, no error handling), this is live via SSE and falls back to the sponsor's name if its logo 404s. */
export function SponsorCarousel({ sponsors, intervalMs = durations.sponsorDisplayMs }: SponsorCarouselProps) {
  const [index, setIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setImageFailed(false);
  }, [sponsors.length]);

  useEffect(() => {
    if (sponsors.length <= 1) return;
    const interval = setInterval(() => {
      setImageFailed(false);
      setIndex((i) => (i + 1) % sponsors.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [sponsors.length, intervalMs]);

  if (sponsors.length === 0) return null;
  const sponsor = sponsors[index % sponsors.length];
  if (!sponsor) return null;

  return (
    <div className="sponsor-carousel">
      {sponsor.logoUrl && !imageFailed ? (
        <img
          className="sponsor-carousel__logo"
          src={sponsor.logoUrl}
          alt={sponsor.name}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="sponsor-carousel__name">{sponsor.name}</span>
      )}
    </div>
  );
}
