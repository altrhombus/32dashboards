import { useEffect, useState, type CSSProperties } from "react";
import type { Sponsor } from "@32dashboards/schema";
import { durations } from "../../tokens/tokens.js";
import { useLogoCheck } from "./logoBackdrop.js";
import "./SponsorCarousel.css";

export interface SponsorCarouselProps {
  sponsors: Sponsor[];
  intervalMs?: number;
  /**
   * The color the logos sit on (hex), so a see-through logo set to "auto"
   * gets a plate when it would be hard to read there. Without it, no plates.
   */
  background?: string;
}

/** How long the outgoing logo takes to leave before the next comes in (matches the CSS). */
export const SPONSOR_LEAVE_MS = 450;

/**
 * One logo at a time, as big as its box allows without stretching, with a
 * soft transition between them: the outgoing logo fades and drifts out,
 * the next fades in with a slight zoom. Falls back to the sponsor's name if
 * its logo can't load.
 */
export function SponsorCarousel({
  sponsors,
  intervalMs = durations.sponsorDisplayMs,
  background,
}: SponsorCarouselProps) {
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
          <Logo sponsor={sponsor} background={background} onError={() => setFailed(sponsor.logoUrl)} />
        ) : (
          <span className="sponsor-carousel__name">{sponsor.name}</span>
        )}
      </div>
    </div>
  );
}

/** One logo, with the backdrop its sponsor asks for ("auto": a plate only if it needs one here). */
function Logo({ sponsor, background, onError }: { sponsor: Sponsor; background?: string; onError: () => void }) {
  const url = sponsor.logoUrl!;
  const mode = sponsor.backdrop ?? "auto";
  // A plate is sized to the logo's shape, so it needs the check too.
  const check = useLogoCheck(mode === "plate" || (mode === "auto" && background) ? url : null, background ?? "#000000");
  if (mode === "auto" && background && !check) return null; // a moment, while it's checked
  const effective = mode === "auto" ? (check?.needsPlate ? "plate" : "none") : mode;
  const image = (className: string) => <img className={className} src={url} alt={sponsor.name} onError={onError} />;
  if (effective === "plate" && check) {
    return (
      <span className="sponsor-carousel__plate" style={{ "--logo-ratio": check.ratio } as CSSProperties}>
        {image("sponsor-carousel__logo")}
      </span>
    );
  }
  if (effective === "mono") {
    const mask = `url("${url.replace(/"/g, "%22")}")`;
    return (
      <span
        className="sponsor-carousel__mono"
        role="img"
        aria-label={sponsor.name}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      />
    );
  }
  return image(
    effective === "outline" ? "sponsor-carousel__logo sponsor-carousel__logo--outline" : "sponsor-carousel__logo",
  );
}
