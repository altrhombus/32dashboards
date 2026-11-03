import type { FundraiserEvent } from "./event.js";

/** Where the night's Ask Me is: what's on now, and how it fits the plan. */
export interface AskMeProgress {
  /** Planned rounds, or 0 for one repeating appeal. */
  count: number;
  /** 1-based number of the round on now (count + 1 once all are done). */
  number: number;
  /** The round on now, if there's a plan and it isn't finished. */
  roundId: string | null;
  title: string;
  message: string;
  /** The round after this one, if any. */
  next: { title: string } | null;
  /** Every planned round is finished. */
  done: boolean;
}

/** What the Ask Me screen and the console should show now. */
export function askMeProgress(event: Pick<FundraiserEvent, "askMe" | "askMeRounds" | "askMeCurrent">): AskMeProgress {
  const rounds = event.askMeRounds;
  if (rounds.length === 0) {
    return {
      count: 0,
      number: 1,
      roundId: null,
      title: event.askMe.title,
      message: event.askMe.message,
      next: null,
      done: false,
    };
  }
  const index = Math.min(event.askMeCurrent, rounds.length);
  const round = rounds[index];
  const next = rounds[index + 1];
  return {
    count: rounds.length,
    number: index + 1,
    roundId: round?.id ?? null,
    title: round ? round.title || `Ask Me ${index + 1}` : "Thank you!",
    message: round ? round.message : "",
    next: next ? { title: next.title || `Ask Me ${index + 2}` } : null,
    done: !round,
  };
}
