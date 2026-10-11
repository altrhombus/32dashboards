import type NodeCG from "nodecg/types";
import type { z } from "zod";
import { formatCurrency } from "@32dashboards/schema/core";
import { getCore, type FundraiserCoreApi, type LogLevel, type SourceReport } from "./contract.js";
import { createEventSettings, type EventSettings } from "./eventSettings.js";
import { secretStoreFor, type SecretStore } from "./secrets.js";

export interface PollContext<C> {
  eventId: string;
  config: C;
  secrets: Readonly<Record<string, string>>;
  /** Aborted when the active event changes, settings change, or the source stops. Pass it to every fetch. */
  signal: AbortSignal;
  log(level: LogLevel, message: string): void;
}

export interface PollResult {
  total: number;
  items?: SourceReport["items"];
}

export interface PollingSourceDefinition<S extends z.ZodTypeAny> {
  id: string;
  label: string;
  /** Per-event settings, edited with the `setConfig` Message. */
  configSchema: S;
  /** Per-event credentials, edited with the `setSecret` Message. */
  secretKeys?: readonly string[];
  /** Secrets that must be set before polling starts. */
  requiredSecrets?: readonly string[];
  intervalSeconds(config: z.output<S>): number;
  /** Fetches one observation. Throw to report a failed cycle; it's retried on the next one. */
  poll(context: PollContext<z.output<S>>): Promise<PollResult>;
}

export interface PollingSourceOptions {
  core?: FundraiserCoreApi;
  secrets?: SecretStore;
  now?: () => string;
}

export interface PollingSource<C> {
  settings: EventSettings<C>;
  stop(): void;
}

/**
 * Runs a polling adapter: polls the active event while it names this source,
 * one cycle at a time, every `intervalSeconds`. Switching events or editing
 * settings aborts the cycle in flight and starts a fresh one. Every result
 * carries the event id captured when its cycle started.
 */
export function createPollingSource<S extends z.ZodTypeAny>(
  nodecg: NodeCG.ServerAPI,
  definition: PollingSourceDefinition<S>,
  options: PollingSourceOptions = {},
): PollingSource<z.output<S>> {
  const core = options.core ?? getCore(nodecg.extensions);
  const now = options.now ?? (() => new Date().toISOString());
  const handle = core.registerSource(definition.id, { label: definition.label });
  const settings = createEventSettings({
    nodecg,
    core,
    configSchema: definition.configSchema,
    secretKeys: definition.secretKeys ?? [],
    secrets: options.secrets ?? secretStoreFor(definition.id),
  });

  let target: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let stopped = false;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void cycle(), ms);
  };

  /** Drops any cycle in flight or pending, then starts over for the current target. */
  const restart = () => {
    clearTimeout(timer);
    inFlight?.abort(new Error("restarted"));
    inFlight = null;
    if (stopped) return;
    if (target) schedule(0);
    else handle.setStatus({ state: "idle", message: "Not used by the active event", eventId: null });
  };

  const currentTarget = (): string | null => {
    const active = core.getActiveEventId();
    return active && core.getEvent(active)?.source.adapterId === definition.id ? active : null;
  };

  const retarget = () => {
    const next = currentTarget();
    if (next === target) return;
    target = next;
    restart();
  };

  async function cycle(): Promise<void> {
    const eventId = target;
    if (!eventId || stopped) return;

    const config = settings.getConfig(eventId);
    if (config === undefined) {
      handle.setStatus({ state: "error", message: "Not configured for this event", eventId });
      return; // a settings change restarts the loop
    }
    const secrets = settings.getSecrets(eventId);
    const missing = (definition.requiredSecrets ?? []).filter((key) => !secrets[key]);
    if (missing.length) {
      handle.setStatus({ state: "error", message: `Missing ${missing.join(", ")}`, eventId });
      return;
    }

    const controller = new AbortController();
    inFlight = controller;
    handle.setStatus({ state: "working", message: "Fetching…", eventId });
    try {
      const result = await definition.poll({
        eventId,
        config,
        secrets,
        signal: controller.signal,
        log: (level, message) => handle.log(level, message, eventId),
      });
      if (controller.signal.aborted) return;
      const outcome = handle.report({ eventId, total: result.total, items: result.items, observedAt: now() });
      if (outcome === "stored") {
        const count = result.items?.length ?? 0;
        handle.setStatus({
          state: "ok",
          message: `${formatCurrency(result.total)} · ${count} item${count === 1 ? "" : "s"}`,
          eventId,
        });
      } else {
        handle.setStatus({ state: "error", message: `Result not stored (${outcome})`, eventId });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      handle.setStatus({ state: "error", message, eventId });
      handle.log("error", `Fetch failed: ${message}`, eventId);
    } finally {
      if (inFlight === controller) inFlight = null;
    }
    if (!stopped && target === eventId) schedule(definition.intervalSeconds(config) * 1000);
  }

  const unsubscribers = [
    core.onActiveEventChange(retarget),
    core.onEventsChange(retarget),
    settings.onChange((eventId) => {
      if (eventId === target) restart();
    }),
    handle.onRefreshRequested((eventId) => {
      if (eventId === target && !inFlight) restart();
    }),
  ];

  target = currentTarget();
  restart();

  return {
    settings,
    stop() {
      stopped = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      restart();
    },
  };
}
