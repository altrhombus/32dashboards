/**
 * Static design tokens -- invariant across events. Per-event values
 * (accent color, logo, fonts) come from EventConfig.theme via ThemeProvider,
 * not from here. These constants replace the scattered magic numbers in
 * legacy main.js (rotation intervals, celebration timings, scroller speed).
 */

export const spacing = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2.5rem",
} as const;

export const radii = {
  sm: "6px",
  md: "12px",
  lg: "20px",
  pill: "999px",
} as const;

export const zIndex = {
  header: 100,
  askMeOverlay: 500,
  incentiveCelebration: 600,
  grandCelebration: 2000,
} as const;

export const easing = {
  /** The signature "arcade/marathon" bounce used for celebratory moments. */
  overshoot: "cubic-bezier(.36,1.5,.64,1)",
  standard: "cubic-bezier(.4,0,.2,1)",
} as const;

export const durations = {
  featuredItemRotationMs: 15_000,
  countdownTickMs: 100,
  countdownTenthsThresholdMs: 5 * 60 * 1000,
  sponsorDisplayMs: 5_500,
  sponsorFadeMs: 500,
  scrollerSpeedPxPerFrame: 1.2,
  incentiveCelebrationMessageMs: 4_500,
  incentiveCelebrationDetailMs: 5_000,
  grandCelebrationBurstIntervalMs: 900,
  totalAnimationMs: 800,
} as const;

export const featuredItemsGridSize = 6;
