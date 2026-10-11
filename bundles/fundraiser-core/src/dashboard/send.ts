import type { CoreMessageName, CoreMessagePayload } from "@32dashboards/schema/core";

export { errorText } from "@32dashboards/nodecg-react";

/** Sends a typed operator Message to fundraiser-core and resolves with its ack. */
export function send<N extends CoreMessageName>(name: N, payload: CoreMessagePayload<N>): Promise<unknown> {
  return nodecg.sendMessageToBundle(name, "fundraiser-core", payload);
}
