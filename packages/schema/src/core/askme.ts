import type { FundraiserEvent } from "./event.js";

/** The console's Ask Me buttons when neither the round nor its message names any amounts. */
export const DEFAULT_ASK_ME_AMOUNTS = [10, 25, 50, 100, 250, 500];

/** Most amount buttons a round gets. */
export const MAX_ASK_ME_AMOUNTS = 8;

/**
 * Dollar amounts in an appeal's text, in the order they're called out: "**$200** for a week
 * of meals, $100 …" -> [200, 100]. Repeats count once.
 */
export function amountsInText(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/g)) {
    const value = Number(`${match[1]!.replace(/,/g, "")}${match[2] ?? ""}`);
    if (value > 0 && value <= 1_000_000 && !found.includes(value)) found.push(value);
  }
  return found.slice(0, MAX_ASK_ME_AMOUNTS);
}

/** Where a round's buttons come from: set on the round, read from its message, or the usual ones. */
export type AskMeAmountsFrom = "set" | "message" | "usual";

/** The amount buttons for an appeal, and where they came from. */
export function askMeAmounts(appeal: { amounts: number[]; message: string }): {
  amounts: number[];
  from: AskMeAmountsFrom;
} {
  if (appeal.amounts.length) return { amounts: appeal.amounts, from: "set" };
  const inText = amountsInText(appeal.message);
  if (inText.length) return { amounts: inText, from: "message" };
  return { amounts: DEFAULT_ASK_ME_AMOUNTS, from: "usual" };
}

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
  /** The console's amount buttons for the round on now. */
  amounts: number[];
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
      amounts: askMeAmounts(event.askMe).amounts,
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
    amounts: round ? askMeAmounts(round).amounts : DEFAULT_ASK_ME_AMOUNTS,
    next: next ? { title: next.title || `Ask Me ${index + 2}` } : null,
    done: !round,
  };
}
