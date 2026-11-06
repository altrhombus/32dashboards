import { useEffect, useState } from "react";
import type { Sponsor } from "@32dashboards/schema";
import { durations } from "../../tokens/tokens.js";
import "./SponsorCarousel.css";

export interface SponsorCarouselProps {
  sponsors: Sponsor[];
  intervalMs?: number;
}

/** How long the outgoing logo takes to leave before the next comes in (matches the CSS). */
export const SPONSOR_LEAVE_MS = 450;

/**
 * One logo at a time, as big as its box allows without stretching, with a
 * soft transition between them: the outgoing logo fades and drifts out,
 * the next fades in with a slight zoom. Falls back to the sponsor's name if
 * its logo can't load.
 */
export function SponsorCarousel({ sponsors, intervalMs = durations.sponsorDisplayMs }: SponsorCarouselProps) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    setIndex(0);
    setLeaving(false);
  }, [sponsors.length]);

  useEffect(() => {
    if (sponsors.length <= 1) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setLeaving(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % sponsors.length);
        setLeaving(false);
      }, SPONSOR_LEAVE_MS);
    }, intervalMs);
    return () => {
      clearInterval(interval);
      clearTimeout(swap);
    };
  }, [sponsors.length, intervalMs]);

  const sponsor = sponsors[index % Math.max(sponsors.length, 1)];
  if (!sponsor) return null;
  const showLogo = sponsor.logoUrl && failed !== sponsor.logoUrl;

  return (
    <div className="sponsor-carousel">
      {/* key: each logo gets its own entrance */}
      <div key={sponsor.id} className={`sponsor-carousel__slide${leaving ? " sponsor-carousel__slide--leaving" : ""}`}>
        {showLogo ? (
          <img
            className="sponsor-carousel__logo"
            src={sponsor.logoUrl!}
            alt={sponsor.name}
            onError={() => setFailed(sponsor.logoUrl)}
          />
        ) : (
          <span className="sponsor-carousel__name">{sponsor.name}</span>
        )}
      </div>
    </div>
  );
}
