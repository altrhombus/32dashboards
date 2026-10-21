import type { OutputsReplicant, Screen } from "./replicants.js";

/** An output that hasn't checked in for this long counts as gone. */
export const OUTPUT_STALE_MS = 30_000;

export interface ScreenPresence {
  /** Each named screen, in order, and whether a kiosk is showing it. */
  named: { screen: Screen; connected: boolean; since: string | null }[];
  /** Kiosks showing without a named screen: no `?screen=`, or an id nobody set up. */
  unnamed: { screenId: string | null; since: string }[];
}

/** Matches live kiosk outputs to the named screens operators expect. */
export function screenPresence(screens: Screen[], outputs: OutputsReplicant, now: number): ScreenPresence {
  const live = outputs.filter((o) => o.output === "kiosk" && now - Date.parse(o.lastSeenAt) < OUTPUT_STALE_MS);
  const earliest = (list: typeof live) => list.map((o) => o.firstSeenAt).sort()[0] ?? null;
  const named = screens.map((screen) => {
    const mine = live.filter((o) => o.screenId === screen.id);
    return { screen, connected: mine.length > 0, since: earliest(mine) };
  });
  const known = new Set(screens.map((s) => s.id));
  const unnamed = live
    .filter((o) => !o.screenId || !known.has(o.screenId))
    .map((o) => ({ screenId: o.screenId ?? null, since: o.firstSeenAt }));
  return { named, unnamed };
}
