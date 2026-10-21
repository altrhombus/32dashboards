/*
 * The New event guide's plain logic, kept out of the screen so it can be
 * tested: which steps there are, and the milestones a celebration rule makes.
 */

export const STEPS = [
  { id: "start", label: "Start" },
  { id: "name", label: "Name" },
  { id: "money", label: "Money" },
  { id: "look", label: "Look" },
  { id: "celebrate", label: "Celebrations" },
  { id: "extras", label: "Extras" },
  { id: "ready", label: "Ready" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** At most this many milestones (the event schema's limit). */
export const MAX_MILESTONES = 50;

/** Milestones every `every` dollars up to `upTo`: 1000, 2000, … Empty if the numbers don't make sense. */
export function milestoneAmounts(every: number, upTo: number): number[] {
  if (!(every > 0) || !(upTo >= every)) return [];
  const count = Math.min(Math.floor(upTo / every), MAX_MILESTONES);
  return Array.from({ length: count }, (_, i) => Math.round((i + 1) * every * 100) / 100);
}

/** "2026-10-24T21:00" in the browser's time zone -> ISO, or null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO -> the value a datetime-local input shows, in the browser's time zone. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
