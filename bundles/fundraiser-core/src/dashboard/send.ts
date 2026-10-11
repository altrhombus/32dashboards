import type { CoreMessageName, CoreMessagePayload } from "@32dashboards/schema/core";

/** Sends a typed operator Message to fundraiser-core and resolves with its ack. */
export function send<N extends CoreMessageName>(name: N, payload: CoreMessagePayload<N>): Promise<unknown> {
  return nodecg.sendMessage(name, payload);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
