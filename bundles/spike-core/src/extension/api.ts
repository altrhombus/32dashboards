export type { SpikeTotal } from "../schemas/index.js";

/** What a source reports: only what it observed, never adjusted. */
export interface SourceResult {
  total: number;
  observedAt: string;
}

/** The API spike-core exports to other bundles via `nodecg.extensions["spike-core"]`. */
export interface SpikeCoreApi {
  /** Registers a data source; returns the function the source calls with each new result. */
  registerSource(sourceId: string): (result: SourceResult) => void;
}
