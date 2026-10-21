import { CommandError, type ReportOutcome } from "@32dashboards/source-sdk";
import {
  FundraiserEventSchema,
  type CreateEventMessage,
  type DonationMoment,
  type FundraiserEvent,
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

export function updateEvent(state: CoreState, { eventId, patch }: UpdateEventMessage, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, (event) => {
    const { theme, askMe, infoBar, ...rest } = patch;
    return {
      ...rest,
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

/** Adds to the Ask Me total, never below zero. */
export function nudgeAskMe(state: CoreState, eventId: string, delta: number, deps: Deps): CoreState {
  return editEvent(state, eventId, deps, (event) => ({
    askMe: { ...event.askMe, total: Math.max(0, roundCents(event.askMe.total + delta)) },
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

/**
 * Compares a newly stored result with the previous one for the same event
 * and returns what's worth celebrating: a rise in the source total, and
 * items with more bids or a higher bid. The first result for an event yields
 * nothing (it's a baseline, not a donation), and items hidden by the event's
 * filters are never celebrated.
 */
export function detectMoments(
  previous: SourceResult | undefined,
  next: SourceResult,
  event: FundraiserEvent,
  deps: Deps,
): DonationMoment[] {
  if (!previous) return [];
  const base = { eventId: next.eventId, at: next.observedAt };
  const moments: DonationMoment[] = [];

  const delta = roundCents(next.total - previous.total);
  if (delta > 0) {
    moments.push({
      kind: "total-increase",
      id: deps.newId(),
      ...base,
      delta,
      total: roundCents(next.total + event.adjustment),
    });
  }

  const before = new Map(previous.items.map((item) => [item.id, item]));
  let bids = 0;
  for (const item of applyFilters(next.items, event.filters).items) {
    const old = before.get(item.id);
    if (!old) continue;
    const moreBids = item.bidCount !== null && old.bidCount !== null && item.bidCount > old.bidCount;
    const higherBid = item.currentBid !== null && old.currentBid !== null && item.currentBid > old.currentBid;
    if (!moreBids && !higherBid) continue;
    moments.push({
      kind: "new-bid",
      id: deps.newId(),
      ...base,
      itemId: item.id,
      itemTitle: item.title,
      amount: item.currentBid,
      bidCount: item.bidCount,
    });
    if (++bids >= MAX_BID_MOMENTS_PER_RESULT) break;
  }
  return moments;
}

/**
 * Milestones and incentive targets the displayed total just crossed, going
 * up, on the same event. Comparing displayed totals (not source results)
 * means adjustments count, and switching events or restarting never
 * re-celebrates a threshold that was already passed.
 */
export function detectThresholdMoments(
  previous: LiveStateReplicant,
  next: LiveStateReplicant,
  deps: Deps,
): DonationMoment[] {
  const event = next.event;
  if (!event || previous.event?.id !== event.id || next.total <= previous.total) return [];
  const crossed = (amount: number) => previous.total < amount && amount <= next.total;
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
export function applyFilters(items: SourceItem[], filters: string[]): { items: SourceItem[]; hidden: number } {
  const terms = filters.map((f) => f.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return { items, hidden: 0 };
  const kept = items.filter((item) => {
    const title = item.title.toLowerCase();
    return !terms.some((term) => title.includes(term));
  });
  return { items: kept, hidden: items.length - kept.length };
}

/** What graphics render: the active event, its adjusted total, filtered items. */
export function computeLiveState(state: CoreState): LiveStateReplicant {
  const event = state.activeEventId ? (state.events.find((e) => e.id === state.activeEventId) ?? null) : null;
  const result = event ? state.sourceResults[event.id] : undefined;
  const rawTotal = result?.total ?? 0;
  const adjustment = event?.adjustment ?? 0;
  const { items, hidden } = applyFilters(result?.items ?? [], event?.filters ?? []);
  return {
    event,
    rawTotal,
    adjustment,
    total: roundCents(rawTotal + adjustment),
    items,
    hiddenItemCount: hidden,
    sourceId: result?.sourceId ?? null,
    observedAt: result?.observedAt ?? null,
  };
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
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
