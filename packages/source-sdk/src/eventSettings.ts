import type NodeCG from "nodecg/types";
import { z } from "zod";
import { CommandError, listenForCommand } from "./commands.js";
import type { FundraiserCoreApi } from "./contract.js";
import type { SecretStore } from "./secrets.js";

/*
 * Per-event adapter settings. Plain settings (IDs, intervals) live in the
 * adapter's persisted `configs` Replicant; credentials live in a SecretStore
 * and panels only see which keys are set, via `secretStatus`. Both follow
 * the event: they're copied when it's duplicated and removed when it's
 * deleted.
 *
 * Messages (sent to the adapter bundle):
 *   setConfig  { eventId, config }               validated by the adapter's config schema
 *   setSecret  { eventId, key, value | null }    null clears the secret
 */

const eventId = z.string().uuid();

/** The Replicant schemas an adapter bundle using event settings must export from `src/schemas`. */
export function eventSettingsSchemas<S extends z.ZodTypeAny>(configSchema: S) {
  return {
    configs: z.record(z.string(), configSchema),
    secretStatus: z.record(z.string(), z.array(z.string())),
  };
}

export interface EventSettingsOptions<S extends z.ZodTypeAny> {
  nodecg: NodeCG.ServerAPI;
  core: FundraiserCoreApi;
  configSchema: S;
  secretKeys: readonly string[];
  secrets: SecretStore;
}

export interface EventSettings<C> {
  getConfig(eventId: string): C | undefined;
  getSecrets(eventId: string): Readonly<Record<string, string>>;
  /** Called with the event id whenever that event's config or secrets change. */
  onChange(listener: (eventId: string) => void): () => void;
}

export function createEventSettings<S extends z.ZodTypeAny>(
  options: EventSettingsOptions<S>,
): EventSettings<z.output<S>> {
  const { nodecg, core, configSchema, secretKeys, secrets } = options;
  type Config = z.output<S>;

  const configs = nodecg.Replicant<Record<string, Config>>("configs", { defaultValue: {} });
  const secretStatus = nodecg.Replicant<Record<string, string[]>>("secretStatus", {
    defaultValue: {},
    persistent: false,
  });
  const listeners = new Set<(eventId: string) => void>();

  const plainConfigs = (): Record<string, Config> => JSON.parse(JSON.stringify(configs.value ?? {}));
  const changed = (id: string) => {
    for (const listener of listeners) listener(id);
  };
  const refreshSecretStatus = () => {
    secretStatus.value = Object.fromEntries(secrets.scopes().map((scope) => [scope, secrets.keys(scope)]));
  };
  const requireEvent = (id: string) => {
    if (!core.getEvent(id)) throw new CommandError(`No event with id ${id}`);
  };

  listenForCommand(nodecg, "setConfig", z.object({ eventId, config: configSchema }).strict(), (payload) => {
    requireEvent(payload.eventId);
    configs.value = { ...plainConfigs(), [payload.eventId]: payload.config };
    changed(payload.eventId);
  });

  const secretKey = z.string().refine((key) => secretKeys.includes(key), { message: "Unknown secret" });
  listenForCommand(
    nodecg,
    "setSecret",
    z.object({ eventId, key: secretKey, value: z.string().max(8192).nullable() }).strict(),
    (payload) => {
      requireEvent(payload.eventId);
      secrets.set(payload.eventId, payload.key, payload.value?.trim() || null);
      refreshSecretStatus();
      changed(payload.eventId);
    },
  );

  // Drop settings for deleted events, so credentials don't outlive them.
  const prune = () => {
    const live = new Set(core.listEvents().map((e) => e.id));
    const current = plainConfigs();
    const kept = Object.fromEntries(Object.entries(current).filter(([id]) => live.has(id)));
    if (Object.keys(kept).length !== Object.keys(current).length) configs.value = kept;
    const stale = secrets.scopes().filter((scope) => !live.has(scope));
    for (const scope of stale) secrets.deleteScope(scope);
    if (stale.length) refreshSecretStatus();
  };
  core.onEventsChange(prune);
  core.onEventDuplicated((from, to) => {
    const config = plainConfigs()[from];
    if (config !== undefined) configs.value = { ...plainConfigs(), [to]: config };
    secrets.copyScope(from, to);
    refreshSecretStatus();
  });
  prune();
  refreshSecretStatus();

  return {
    getConfig(id) {
      const parsed = configSchema.safeParse(configs.value?.[id]);
      return parsed.success ? (parsed.data as Config) : undefined;
    },
    getSecrets: (id) => secrets.read(id),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
