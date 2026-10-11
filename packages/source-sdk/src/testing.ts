import type { FundraiserEvent } from "@32dashboards/schema/core";
import type { FundraiserCoreApi, ReportOutcome, SourceHandle, SourceReport, StatusUpdate } from "./contract.js";

/*
 * An in-memory FundraiserCoreApi for adapter tests, so adapters can be
 * tested without fundraiser-core. It records what adapters report and
 * lets tests drive events, the active event, and refresh requests.
 */

export interface FakeCore extends FundraiserCoreApi {
  reports: (SourceReport & { sourceId: string })[];
  statuses: (StatusUpdate & { sourceId: string })[];
  logs: { sourceId: string; level: string; message: string }[];
  /** What `report` returns next (defaults to "stored"). */
  nextOutcome: ReportOutcome;
  setEvents(events: FundraiserEvent[]): void;
  activate(eventId: string | null): void;
  duplicate(from: string, to: string): void;
  requestRefresh(sourceId: string, eventId: string): void;
}

export function createFakeCore(events: FundraiserEvent[] = []): FakeCore {
  let list = events;
  let active: string | null = null;
  const activeListeners = new Set<(id: string | null) => void>();
  const eventListeners = new Set<(events: FundraiserEvent[]) => void>();
  const duplicateListeners = new Set<(from: string, to: string) => void>();
  const refreshListeners = new Map<string, Set<(id: string) => void>>();
  const sub = <L>(set: Set<L>, listener: L) => {
    set.add(listener);
    return () => set.delete(listener);
  };

  const fake: FakeCore = {
    reports: [],
    statuses: [],
    logs: [],
    nextOutcome: "stored",
    registerSource(sourceId): SourceHandle {
      const listeners = new Set<(id: string) => void>();
      refreshListeners.set(sourceId, listeners);
      return {
        sourceId,
        report: (result) => {
          fake.reports.push({ ...result, sourceId });
          return fake.nextOutcome;
        },
        setStatus: (status) => fake.statuses.push({ ...status, sourceId }),
        log: (level, message) => fake.logs.push({ sourceId, level, message }),
        onRefreshRequested: (listener) => sub(listeners, listener),
      };
    },
    getActiveEventId: () => active,
    getEvent: (id) => list.find((e) => e.id === id),
    listEvents: () => list,
    onActiveEventChange: (listener) => sub(activeListeners, listener),
    onEventsChange: (listener) => sub(eventListeners, listener),
    onEventDuplicated: (listener) => sub(duplicateListeners, listener),
    setEvents(next) {
      list = next;
      for (const listener of eventListeners) listener(next);
    },
    activate(id) {
      active = id;
      for (const listener of activeListeners) listener(id);
    },
    duplicate(from, to) {
      for (const listener of duplicateListeners) listener(from, to);
    },
    requestRefresh(sourceId, eventId) {
      for (const listener of refreshListeners.get(sourceId) ?? []) listener(eventId);
    },
  };
  return fake;
}

/** A minimal valid event for tests. */
export function testEvent(id: string, adapterId: string | null, overrides: Partial<FundraiserEvent> = {}): FundraiserEvent {
  return {
    id,
    name: `Event ${id.slice(0, 4)}`,
    causeName: "",
    endDateTime: null,
    theme: {
      accentColor: "#ffd700",
      secondaryColor: "#4dd0e1",
      backgroundFrom: "#181c2a",
      backgroundTo: "#23284a",
      logoUrl: null,
      fontDisplay: "Montserrat",
      fontMono: "Share Tech Mono",
    },
    announcements: [],
    askMe: { enabled: false, title: "Ask Me Spotlight", message: "", total: 0 },
    incentives: [],
    sponsors: [],
    source: { adapterId },
    adjustment: 0,
    filters: [],
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
    ...overrides,
  };
}
