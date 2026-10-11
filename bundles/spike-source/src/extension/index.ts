import type NodeCG from "nodecg/types";
import type { SpikeCoreApi } from "spike-core";

const INTERVAL_MS = 5000;

/**
 * Pretends donations arrive every few seconds. Proves the adapter path: a
 * separate bundle registers with spike-core through its exported extension
 * API and reports raw totals, never touching core state directly.
 */
export default function spikeSource(nodecg: NodeCG.ServerAPI) {
  const core = nodecg.extensions["spike-core"] as SpikeCoreApi | undefined;
  if (!core) throw new Error("spike-core extension is not loaded");

  const emit = core.registerSource("spike-fake");
  let total = 0;
  setInterval(() => {
    total += 5 + Math.round(Math.random() * 50);
    emit({ total, observedAt: new Date().toISOString() });
  }, INTERVAL_MS);
}
