import { CommandError, type ReportOutcome } from "@32dashboards/source-sdk";
import {
  FundraiserEventSchema,
  applyFilters,
  liveStateFor,
  roundCents,
  type BidWar,
  type CreateEventMessage,
  type DonationMoment,
  type FundraiserEvent,
  type AskMeRound,
  type LiveStateReplicant,
  type Screen,
  type SourceItem,
  type SourceResult,
  type UpdateEventMessage,
} from "@32dashboards/schema/core";

/*
 * fundraiser-core's state transitions as pure functions over plain data, so
 * they can be tested without NodeCG. Each returns a new CoreState and leaves
 * unchanged fields as the same references, which is how the extension tells
 * which Replicants to write.
 */

export interface CoreState {
  events: FundraiserEvent[];
  activeEventId: string | null;
  sourceResults: Record<string, SourceResult>;
}

export interface Deps {
  now(): string;
  newId(): string;
}

export { CommandError };

function findEvent(state: CoreState, eventId: string): FundraiserEvent {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) throw new CommandError(`No event with id ${eventId}`);
  return event;
}

function replaceEvent(state: CoreState, next: FundraiserEvent): CoreState {
  return { ...state, events: state.events.map((e) => (e.id === next.id ? next : e)) };
}

function editEvent(
  state: CoreState,
  eventId: string,
  deps: Deps,
  edit: (event: FundraiserEvent) => Partial<FundraiserEvent>,
): CoreState {
  const event = findEvent(state, eventId);
  const next = FundraiserEventSchema.parse({ ...event, ...edit(event), id: event.id, updatedAt: deps.now() });
  return replaceEvent(state, next);
}

export function createEvent(
  state: CoreState,
  input: CreateEventMessage,
  deps: Deps,
): { state: CoreState; eventId: string } {
  const now = deps.now();
  const event = FundraiserEventSchema.parse({
    id: deps.newId(),
    name: input.name,
    causeName: input.causeName,
    endDateTime: input.endDateTime,
    theme: {},
    askMe: {},
    source: {},
    createdAt: now,
    updatedAt: now,
  });
  return { state: { ...state, events: [...state.events, event] }, eventId: event.id };
}

/**
 * Edited Ask Me rounds, keeping what the show has done: a finished round stays
 * finished, keeps what it raised, and stays ahead of the rounds still to come,
 * whatever an editor that opened before it finished sends. Returns where the
 * show is in the list.
 */
function mergeAskMeRounds(event: FundraiserEvent, edited: AskMeRound[]) {
  const before = new Map(event.askMeRounds.map((round) => [round.id, round]));
  const kept = new Set(edited.map((round) => round.id));
  const merged = edited.map((round) => ({ ...round, raised: before.get(round.id)?.raised ?? null }));
  const missing = event.askMeRounds.filter((round) => round.raised !== null && !kept.has(round.id));
  const finished = [...missing, ...merged.filter((round) => round.raised !== null)];
  return {
    askMeRounds: [...finished, ...merged.filter((round) => round.raised === null)],
    askMeCurrent: finished.length,
  };
}

/** Edited bid wars, keeping each option's running total, which only nudges change. */
function mergeBidWars(event: FundraiserEvent, edited: BidWar[]): BidWar[] {
  const totals = new Map(event.bidWars.flatMap((war) => war.options.map((o) => [o.id, o.total] as const)));
  return edited.map((war) => ({
    ...war,
    options: war.options.map((option) => ({ ...option, total: totals.get(option.id) ?? 0 })),
  }));
}

export function updateEvent(state: CoreState, { eventId, patch }: UpdateEventMessage, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, (event) => {
    const { theme, askMe, infoBar, askMeRounds, bidWars, ...rest } = patch;
    return {
      ...rest,
      ...(askMeRounds && mergeAskMeRounds(event, askMeRounds)),
      ...(bidWars && { bidWars: mergeBidWars(event, bidWars) }),
      ...(theme && { theme: { ...event.theme, ...theme } }),
      ...(askMe && { askMe: { ...event.askMe, ...askMe } }),
      ...(infoBar && { infoBar: { ...event.infoBar, ...infoBar } }),
    };
  });
}

/**
 * Copies an event's setup (look, sponsors, incentives, milestones, bid
 * wars, prizes, announcements, filters, source) for reuse. Anything that
 * describes how the copied event *went* is reset: the adjustment, incentive
 * progress flags, bid war totals, the Ask Me total, and source results.
 */
export function duplicateEvent(
  state: CoreState,
  input: { eventId: string; name?: string | undefined },
  deps: Deps,
): { state: CoreState; eventId: string } {
  const source = findEvent(state, input.eventId);
  const now = deps.now();
  const copy = FundraiserEventSchema.parse({
    ...structuredClone(source),
    id: deps.newId(),
    name: input.name ?? `${source.name} (copy)`.slice(0, 200),
    incentives: source.incentives.map((incentive) => ({
      ...incentive,
      id: deps.newId(),
      active: false,
      displayNow: false,
    })),
    sponsors: source.sponsors.map((sponsor) => ({ ...sponsor, id: deps.newId() })),
    milestones: source.milestones.map((milestone) => ({ ...milestone, id: deps.newId() })),
    prizes: source.prizes.map((prize) => ({ ...prize, id: deps.newId() })),
    bidWars: source.bidWars.map((war) => ({
      ...war,
      id: deps.newId(),
      options: war.options.map((option) => ({ ...option, id: deps.newId(), total: 0 })),
    })),
    askMe: { ...source.askMe, enabled: false, total: 0 },
    adjustment: 0,
    askMeRaised: 0,
    askMeRounds: source.askMeRounds.map((round) => ({ ...round, id: deps.newId(), raised: null })),
    askMeCurrent: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { state: { ...state, events: [...state.events, copy] }, eventId: copy.id };
}

export function deleteEvent(state: CoreState, eventId: string): CoreState {
  findEvent(state, eventId);
  if (state.activeEventId === eventId) {
    throw new CommandError("That event is on screen. Activate another event (or none) before deleting it.");
  }
  let { sourceResults } = state;
  if (eventId in sourceResults) {
    sourceResults = { ...sourceResults };
    delete sourceResults[eventId];
  }
  return { ...state, events: state.events.filter((e) => e.id !== eventId), sourceResults };
}

export function activateEvent(state: CoreState, eventId: string | null): CoreState {
  if (eventId !== null) findEvent(state, eventId);
  return state.activeEventId === eventId ? state : { ...state, activeEventId: eventId };
}

export function setAdjustment(state: CoreState, eventId: string, amount: number, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, () => ({ adjustment: roundCents(amount) }));
}

export function nudgeAdjustment(state: CoreState, eventId: string, delta: number, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, (event) => ({ adjustment: roundCents(event.adjustment + delta) }));
}

/**
 * Finishes the Ask Me round that's on now: adds `amount` to the total
 * (askMeRaised) and starts the next at $0. With planned rounds, records what
 * the round raised and moves on to the next one. `amount` must equal the
 * round's total and `roundId` the round on now, so a round that was already
 * finished (from another phone, say) isn't finished again.
 */
export function finishAskMeRound(
  state: CoreState,
  eventId: string,
  amount: number,
  roundId: string | undefined,
  deps: Deps,
): CoreState {
  const event = findEvent(state, eventId);
  const planned = event.askMeRounds.length > 0;
  const current = planned ? event.askMeRounds[event.askMeCurrent] : undefined;
  if (planned && (!current || current.id !== roundId)) {
    throw new CommandError("That Ask Me round was already finished.");
  }
  if (roundCents(event.askMe.total) !== roundCents(amount)) {
    throw new CommandError(
      event.askMe.total === 0 && !planned
        ? "That Ask Me round was already added to the total."
        : `The Ask Me round is now ${event.askMe.total}, not ${amount}; try again.`,
    );
  }
  if (!planned && amount <= 0) throw new CommandError("There's nothing in this Ask Me round to add.");
  return editEvent(state, eventId, deps, (e) => ({
    askMe: { ...e.askMe, total: 0 },
    askMeRaised: roundCents(e.askMeRaised + amount),
    ...(planned && {
      askMeRounds: e.askMeRounds.map((r, i) => (i === e.askMeCurrent ? { ...r, raised: roundCents(amount) } : r)),
      askMeCurrent: e.askMeCurrent + 1,
    }),
  }));
}

/** Undoes finishAskMeRound: takes `amount` back out of the total and goes back to that round. */
export function reopenAskMeRound(
  state: CoreState,
  eventId: string,
  amount: number,
  roundId: string | undefined,
  deps: Deps,
): CoreState {
  const event = findEvent(state, eventId);
  const planned = event.askMeRounds.length > 0;
  if (event.askMeRaised + 0.005 < amount) throw new CommandError("That Ask Me round isn't in the total any more.");
  if (planned) {
    const index = event.askMeRounds.findIndex((r) => r.id === roundId);
    if (index === -1 || index !== event.askMeCurrent - 1) {
      throw new CommandError("Only the most recently finished Ask Me round can be reopened.");
    }
  }
  return editEvent(state, eventId, deps, (e) => ({
    askMe: { ...e.askMe, total: roundCents(e.askMe.total + amount) },
    askMeRaised: roundCents(Math.max(0, e.askMeRaised - amount)),
    ...(planned && {
      askMeRounds: e.askMeRounds.map((r, i) => (i === e.askMeCurrent - 1 ? { ...r, raised: null } : r)),
      askMeCurrent: e.askMeCurrent - 1,
    }),
  }));
}

/**
 * Adds to the Ask Me total, never below zero. With `round` (undoing a tap),
 * refuses if that round has finished, rather than take its money out of the
 * round on now.
 */
export function nudgeAskMe(
  state: CoreState,
  eventId: string,
  delta: number,
  deps: Deps,
  round?: { id: string | null; raised: number },
): CoreState {
  return editEvent(state, eventId, deps, (event) => {
    const currentRound = event.askMeRounds[event.askMeCurrent]?.id ?? null;
    if (round && (round.id !== currentRound || roundCents(round.raised) !== roundCents(event.askMeRaised))) {
      throw new CommandError("That round has finished. To change it, reopen it with its own Undo.");
    }
    return { askMe: { ...event.askMe, total: Math.max(0, roundCents(event.askMe.total + delta)) } };
  });
}

/** Pins one incentive to the info bar in place of any other, or unpins them all. */
export function pinIncentive(state: CoreState, eventId: string, incentiveId: string | null, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, (event) => ({
    incentives: event.incentives.map((incentive) => ({ ...incentive, displayNow: incentive.id === incentiveId })),
  }));
}

export function nudgeBidWar(
  state: CoreState,
  input: { eventId: string; bidWarId: string; optionId: string; delta: number },
  deps: Deps,
): CoreState {
  return editEvent(state, input.eventId, deps, (event) => {
    const war = event.bidWars.find((w) => w.id === input.bidWarId);
    const option = war?.options.find((o) => o.id === input.optionId);
    if (!war || !option) throw new CommandError("That bid war option no longer exists.");
    const total = roundCents(option.total + input.delta);
    if (total < 0) throw new CommandError(`${option.name} can't go below $0.`);
    return {
      bidWars: event.bidWars.map((w) =>
        w.id === war.id ? { ...w, options: w.options.map((o) => (o.id === option.id ? { ...o, total } : o)) } : w,
      ),
    };
  });
}

export function setFilters(state: CoreState, eventId: string, filters: string[], deps: Deps): CoreState {
  const cleaned = [...new Set(filters.map((f) => f.trim()).filter(Boolean))];
  return editEvent(state, eventId, deps, () => ({ filters: cleaned }));
}

export type RecordOutcome = Exclude<ReportOutcome, "invalid">;

/**
 * Stores a source result on the event it names, not on whichever event is
 * active when it arrives. Rejects results for events that don't exist, from
 * a source the event isn't configured for, or older than what's stored.
 */
export function recordSourceResult(
  state: CoreState,
  result: SourceResult,
): { state: CoreState; outcome: RecordOutcome } {
  const event = state.events.find((e) => e.id === result.eventId);
  if (!event) return { state, outcome: "unknown-event" };
  if (event.source.adapterId !== result.sourceId) return { state, outcome: "wrong-source" };

  const previous = state.sourceResults[result.eventId];
  if (previous && Date.parse(previous.observedAt) > Date.parse(result.observedAt)) {
    return { state, outcome: "stale" };
  }
  return {
    state: { ...state, sourceResults: { ...state.sourceResults, [result.eventId]: result } },
    outcome: "stored",
  };
}

/** Caps new-bid moments per result, so a burst after an outage doesn't flood the screen. */
export const MAX_BID_MOMENTS_PER_RESULT = 10;

/** How many of a fixed-price ("Buy Now") item were bought between two snapshots of it. */
export function boughtSince(old: SourceItem | undefined, item: SourceItem): number {
  const was = old?.available;
  const now = item.available;
  return was != null && now != null && now < was ? was - now : 0;
}

/** What bids added to the total between two snapshots of one item (0 if nothing new). */
export function bidMoney(old: SourceItem | undefined, item: SourceItem): number {
  const price = item.currentBid ?? 0;
  // A Buy Now item with several to buy: each one bought adds its price.
  const bought = boughtSince(old, item);
  if (bought > 0) return bought * price;
  const count = item.bidCount ?? 0;
  // An item without bids shows its opening price as its current bid, but it's not in the total yet.
  if (!old || old.bidCount === 0 || old.bidCount === null) return count > 0 ? price : 0;
  const was = old.currentBid ?? 0;
  if (price > was) return price - was;
  // More bids at the same price: an item with several to sell (each adds its price), or a first
  // bid at the opening price.
  if (price === was && count > old.bidCount) return (count - old.bidCount) * price;
  return 0;
}

/**
 * Compares a newly stored result with the previous one for the same event:
 * the items with more bids or a higher bid (to celebrate), how much the
 * source total changed, and how much of that the bids account for (so a
 * DonationLedger can thank only the rest, a donation, and never a bid
 * twice). The first result for an event yields nothing (it's a baseline,
 * not new money), and items hidden by the event's filters are never
 * celebrated, though their bids still count as bid money.
 */
export function compareResults(
  previous: SourceResult | undefined,
  next: SourceResult,
  event: FundraiserEvent,
  deps: Deps,
): { bids: DonationMoment[]; totalDelta: number; fromBids: number } {
  if (!previous) return { bids: [], totalDelta: 0, fromBids: 0 };
  const base = { eventId: next.eventId, at: next.observedAt };
  const before = new Map(previous.items.map((item) => [item.id, item]));

  let fromBids = 0;
  for (const item of next.items) fromBids += bidMoney(before.get(item.id), item);

  const bids: DonationMoment[] = [];
  for (const item of applyFilters(next.items, event.filters).items) {
    const old = before.get(item.id);
    if (!old) continue;
    const moreBids = item.bidCount !== null && old.bidCount !== null && item.bidCount > old.bidCount;
    const higherBid = item.currentBid !== null && old.currentBid !== null && item.currentBid > old.currentBid;
    const bought = boughtSince(old, item);
    if (!moreBids && !higherBid && !bought) continue;
    bids.push({
      kind: "new-bid",
      id: deps.newId(),
      ...base,
      itemId: item.id,
      itemTitle: item.title,
      amount: item.currentBid,
      bidCount: item.bidCount,
      newBids: bought || (moreBids ? item.bidCount! - old.bidCount! : 1),
      purchase: bought > 0,
    });
    if (bids.length >= MAX_BID_MOMENTS_PER_RESULT) break;
  }
  return { bids, totalDelta: roundCents(next.total - previous.total), fromBids: roundCents(fromBids) };
}

/**
 * Milestones and incentive targets the displayed total just crossed, going
 * up, on the same event, past `peak` (the highest it has been). Comparing
 * displayed totals (not source results) means adjustments count; the peak
 * means a total that dips and recovers, a restart, or switching events never
 * re-celebrates a threshold that was already passed.
 */
export function detectThresholdMoments(
  previous: LiveStateReplicant,
  next: LiveStateReplicant,
  deps: Deps,
  peak = previous.total,
): DonationMoment[] {
  const event = next.event;
  if (!event || previous.event?.id !== event.id || next.total <= previous.total) return [];
  const from = Math.max(previous.total, peak);
  const crossed = (amount: number) => from < amount && amount <= next.total;
  const base = { eventId: event.id, at: deps.now() };
  return [
    ...event.milestones
      .filter((m) => crossed(m.amount))
      .sort((a, b) => a.amount - b.amount)
      .map((m): DonationMoment => ({
        kind: "milestone",
        id: deps.newId(),
        ...base,
        milestoneId: m.id,
        amount: m.amount,
        label: m.label,
      })),
    ...event.incentives
      .filter((i) => i.active && crossed(i.target))
      .sort((a, b) => a.target - b.target)
      .map((i): DonationMoment => ({
        kind: "incentive-met",
        id: deps.newId(),
        ...base,
        incentiveId: i.id,
        name: i.name,
        target: i.target,
      })),
  ];
}

/** Hides items whose title contains any filter, case-insensitively. */
export { applyFilters };

/** What graphics render: the active event, its adjusted total, filtered items. */
export function computeLiveState(state: CoreState): LiveStateReplicant {
  const event = state.activeEventId ? (state.events.find((e) => e.id === state.activeEventId) ?? null) : null;
  return liveStateFor(event, event ? state.sourceResults[event.id] : undefined);
}

export const MAX_SCREENS = 12;

/** Adds a screen, or replaces the one with the same id in place. */
export function saveScreen(screens: Screen[], screen: Screen): Screen[] {
  if (screens.some((s) => s.id === screen.id)) return screens.map((s) => (s.id === screen.id ? screen : s));
  if (screens.length >= MAX_SCREENS) throw new CommandError(`There can be at most ${MAX_SCREENS} screens.`);
  return [...screens, screen];
}

export function deleteScreen(screens: Screen[], id: string): Screen[] {
  if (!screens.some((s) => s.id === id)) throw new CommandError(`No screen with id ${id}`);
  return screens.filter((s) => s.id !== id);
}
