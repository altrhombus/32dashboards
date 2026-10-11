import {
  FundraiserEventSchema,
  type CreateEventMessage,
  type FundraiserEvent,
  type LiveStateReplicant,
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

/** A command the operator can fix (unknown event, deleting the active one, …). */
export class CommandError extends Error {
  override name = "CommandError";
}

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
    const { theme, askMe, ...rest } = patch;
    return {
      ...rest,
      ...(theme && { theme: { ...event.theme, ...theme } }),
      ...(askMe && { askMe: { ...event.askMe, ...askMe } }),
    };
  });
}

/**
 * Copies an event's setup (look, sponsors, incentives, announcements,
 * filters, source) for reuse. Anything that describes how the copied event
 * *went* is reset: the adjustment, incentive progress flags, the Ask Me total,
 * and source results.
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

export function setFilters(state: CoreState, eventId: string, filters: string[], deps: Deps): CoreState {
  const cleaned = [...new Set(filters.map((f) => f.trim()).filter(Boolean))];
  return editEvent(state, eventId, deps, () => ({ filters: cleaned }));
}

export type RecordOutcome = "stored" | "unknown-event" | "wrong-source" | "stale";

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
