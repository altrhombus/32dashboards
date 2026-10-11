import type { FundraiserEvent, SourceResultInput } from "@32dashboards/schema/core";
import type { RecordOutcome } from "./state.js";

export type ReportOutcome = RecordOutcome | "invalid";

/** Returned by `registerSource`; the adapter's only way to write core state. */
export interface SourceHandle {
  /**
   * Reports one raw observation for `result.eventId`. Set the event id when
   * the fetch *starts*, so a slow fetch can't land on the wrong event.
   */
  report(result: Omit<SourceResultInput, "sourceId">): ReportOutcome;
}

/** fundraiser-core's extension API, read by other bundles as `nodecg.extensions["fundraiser-core"]`. */
export interface FundraiserCoreApi {
  /** Registers an adapter. Each source id may register once per NodeCG run. */
  registerSource(sourceId: string): SourceHandle;
  getActiveEventId(): string | null;
  getEvent(eventId: string): FundraiserEvent | undefined;
  /** Calls `listener` whenever the active event changes. Returns an unsubscribe function. */
  onActiveEventChange(listener: (eventId: string | null) => void): () => void;
}
