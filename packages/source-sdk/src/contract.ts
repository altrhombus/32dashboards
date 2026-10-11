import type { FundraiserEvent, SourceResultInput, SourceStatus } from "@32dashboards/schema/core";

/*
 * The contract between fundraiser-core and source adapters. Core implements
 * FundraiserCoreApi and exposes it as `nodecg.extensions["fundraiser-core"]`;
 * adapters only ever write core state through a SourceHandle.
 */

export const CORE_BUNDLE = "fundraiser-core";

export type ReportOutcome = "stored" | "unknown-event" | "wrong-source" | "stale" | "invalid";

/** One observation. Set `eventId` when the fetch *starts*, so a slow fetch can't land on the wrong event. */
export type SourceReport = Omit<SourceResultInput, "sourceId">;

export interface StatusUpdate {
  state: SourceStatus["state"];
  message?: string | null;
  eventId?: string | null;
}

export type LogLevel = "info" | "warn" | "error";

/** Returned by `registerSource`; the adapter's only way to write core state. */
export interface SourceHandle {
  readonly sourceId: string;
  /** Reports raw totals and items. Core applies adjustment and filters, never the adapter. */
  report(result: SourceReport): ReportOutcome;
  /** Shows operators what the adapter is doing. */
  setStatus(status: StatusUpdate): void;
  /** Adds a line to the shared source log panels show. */
  log(level: LogLevel, message: string, eventId?: string | null): void;
  /** Called when an operator asks for an immediate fetch for `eventId`. Returns an unsubscribe function. */
  onRefreshRequested(listener: (eventId: string) => void): () => void;
}

export interface RegisterSourceOptions {
  /** Human-readable name for panels, e.g. "32auctions". */
  label: string;
}

export interface FundraiserCoreApi {
  /** Registers an adapter. Each source id may register once per NodeCG run. */
  registerSource(sourceId: string, options: RegisterSourceOptions): SourceHandle;
  getActiveEventId(): string | null;
  getEvent(eventId: string): FundraiserEvent | undefined;
  listEvents(): FundraiserEvent[];
  /** Calls `listener` whenever the active event changes. Returns an unsubscribe function. */
  onActiveEventChange(listener: (eventId: string | null) => void): () => void;
  /** Calls `listener` after any change to the event list (edits, creates, deletes). */
  onEventsChange(listener: (events: FundraiserEvent[]) => void): () => void;
  /** Calls `listener` when an event is duplicated, so adapters can copy their per-event settings. */
  onEventDuplicated(listener: (fromEventId: string, toEventId: string) => void): () => void;
}

/** Reads fundraiser-core's API. Adapter bundles must list fundraiser-core in `bundleDependencies`. */
export function getCore(extensions: Record<string, unknown>): FundraiserCoreApi {
  const core = extensions[CORE_BUNDLE] as FundraiserCoreApi | undefined;
  if (!core) throw new Error(`${CORE_BUNDLE} extension is not loaded; add it to this bundle's bundleDependencies`);
  return core;
}
