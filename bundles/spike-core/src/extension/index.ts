import type NodeCG from "nodecg/types";
import type { SpikeTotal } from "../schemas/index.js";
import type { SourceResult, SpikeCoreApi } from "./api.js";

const initialState: SpikeTotal = { sourceId: null, rawTotal: 0, adjustment: 0, total: 0, observedAt: null };

export default function spikeCore(nodecg: NodeCG.ServerAPI): SpikeCoreApi {
  const state = nodecg.Replicant<SpikeTotal>("spikeTotal", { defaultValue: initialState });

  const update = (patch: Partial<SpikeTotal>) => {
    const next = { ...(state.value ?? initialState), ...patch };
    next.total = next.rawTotal + next.adjustment;
    state.value = next;
  };

  nodecg.listenFor("adjust", (amount: unknown, ack) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      if (ack && !ack.handled) ack(new Error("amount must be a finite number"));
      return;
    }
    update({ adjustment: (state.value ?? initialState).adjustment + amount });
    if (ack && !ack.handled) ack(null, state.value?.total);
  });

  return {
    registerSource(sourceId) {
      nodecg.log.info(`Source registered: ${sourceId}`);
      return (result: SourceResult) => update({ sourceId, rawTotal: result.total, observedAt: result.observedAt });
    },
  };
}
