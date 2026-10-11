import { randomUUID } from "node:crypto";
import type NodeCG from "nodecg/types";
import { ZodError, type z } from "zod";
import {
  SourceResultSchema,
  coreMessageSchemas,
  type ActiveEventIdReplicant,
  type CoreMessageName,
  type EventsReplicant,
  type LiveStateReplicant,
  type RegisteredSourcesReplicant,
  type SourceResultsReplicant,
} from "@32dashboards/schema/core";
import type { FundraiserCoreApi } from "./api.js";
import * as core from "./state.js";

export type { FundraiserCoreApi, ReportOutcome, SourceHandle } from "./api.js";

const deps: core.Deps = { now: () => new Date().toISOString(), newId: randomUUID };

/** Copies a value out of NodeCG's change-tracking proxy. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export default function fundraiserCore(nodecg: NodeCG.ServerAPI): FundraiserCoreApi {
  const events = nodecg.Replicant<EventsReplicant>("events", { defaultValue: [] });
  const activeEventId = nodecg.Replicant<ActiveEventIdReplicant>("activeEventId", { defaultValue: null });
  const sourceResults = nodecg.Replicant<SourceResultsReplicant>("sourceResults", { defaultValue: {} });
  const sources = nodecg.Replicant<RegisteredSourcesReplicant>("sources", { defaultValue: [], persistent: false });

  const read = (): core.CoreState => ({
    events: plain(events.value ?? []),
    activeEventId: activeEventId.value ?? null,
    sourceResults: plain(sourceResults.value ?? {}),
  });

  // Only Replicants whose value actually changed are written, so each write
  // syncs (and persists) just what moved.
  const write = (before: core.CoreState, after: core.CoreState) => {
    if (after.events !== before.events) events.value = after.events;
    if (after.activeEventId !== before.activeEventId) activeEventId.value = after.activeEventId;
    if (after.sourceResults !== before.sourceResults) sourceResults.value = after.sourceResults;
  };

  const liveState = nodecg.Replicant<LiveStateReplicant>("liveState", {
    defaultValue: core.computeLiveState(read()),
    persistent: false,
  });

  // liveState is derived from the persisted Replicants on every change,
  // including edits made outside the Messages below (e.g. a panel assigning
  // a Replicant directly), so displays can't drift from stored state.
  let lastLive = JSON.stringify(liveState.value);
  const refreshLiveState = () => {
    const next = core.computeLiveState(read());
    const serialized = JSON.stringify(next);
    if (serialized === lastLive) return;
    lastLive = serialized;
    liveState.value = next;
  };

  const activeListeners = new Set<(eventId: string | null) => void>();
  let lastActive = activeEventId.value ?? null;
  const notifyActive = () => {
    const current = activeEventId.value ?? null;
    if (current === lastActive) return;
    lastActive = current;
    for (const listener of activeListeners) {
      try {
        listener(current);
      } catch (err) {
        nodecg.log.error("Active-event listener threw:", err);
      }
    }
  };

  events.on("change", refreshLiveState);
  sourceResults.on("change", refreshLiveState);
  activeEventId.on("change", () => {
    refreshLiveState();
    notifyActive();
  });
  refreshLiveState();

  /** Validates a Message payload, runs the command, and acks its result or error. */
  function command<N extends CoreMessageName>(
    name: N,
    run: (state: core.CoreState, payload: z.output<(typeof coreMessageSchemas)[N]>) => {
      state: core.CoreState;
      reply?: unknown;
    },
  ) {
    nodecg.listenFor(name, (raw: unknown, ack) => {
      let reply: unknown;
      try {
        const payload = coreMessageSchemas[name].parse(raw) as z.output<(typeof coreMessageSchemas)[N]>;
        const before = read();
        const result = run(before, payload);
        write(before, result.state);
        reply = result.reply;
      } catch (err) {
        const error = toCommandError(err);
        nodecg.log.warn(`${name} rejected: ${error.message}`);
        if (ack && !ack.handled) ack(error);
        return;
      }
      if (ack && !ack.handled) ack(null, reply);
    });
  }

  command("createEvent", (state, input) => {
    const { state: next, eventId } = core.createEvent(state, input, deps);
    return { state: next, reply: eventId };
  });
  command("updateEvent", (state, input) => ({ state: core.updateEvent(state, input, deps) }));
  command("duplicateEvent", (state, input) => {
    const { state: next, eventId } = core.duplicateEvent(state, input, deps);
    return { state: next, reply: eventId };
  });
  command("deleteEvent", (state, { eventId }) => ({ state: core.deleteEvent(state, eventId) }));
  command("activateEvent", (state, { eventId }) => ({ state: core.activateEvent(state, eventId) }));
  command("setAdjustment", (state, { eventId, amount }) => ({
    state: core.setAdjustment(state, eventId, amount, deps),
  }));
  command("nudgeAdjustment", (state, { eventId, delta }) => ({
    state: core.nudgeAdjustment(state, eventId, delta, deps),
  }));
  command("setFilters", (state, { eventId, filters }) => ({
    state: core.setFilters(state, eventId, filters, deps),
  }));

  const registered = new Set<string>();

  return {
    registerSource(sourceId) {
      if (registered.has(sourceId)) throw new Error(`Source "${sourceId}" is already registered`);
      registered.add(sourceId);
      sources.value = [...plain(sources.value ?? []), { id: sourceId, registeredAt: deps.now() }];
      nodecg.log.info(`Source registered: ${sourceId}`);

      return {
        report(input) {
          const parsed = SourceResultSchema.safeParse({ ...input, sourceId });
          if (!parsed.success) {
            nodecg.log.warn(`Invalid result from ${sourceId}: ${formatZodError(parsed.error)}`);
            return "invalid";
          }
          const before = read();
          const { state, outcome } = core.recordSourceResult(before, parsed.data);
          if (outcome === "stored") write(before, state);
          else nodecg.log.warn(`Ignored result from ${sourceId} for event ${parsed.data.eventId}: ${outcome}`);
          return outcome;
        },
      };
    },
    getActiveEventId: () => activeEventId.value ?? null,
    getEvent: (eventId) => {
      const event = events.value?.find((e) => e.id === eventId);
      return event ? plain(event) : undefined;
    },
    onActiveEventChange(listener) {
      activeListeners.add(listener);
      return () => activeListeners.delete(listener);
    },
  };
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

function toCommandError(err: unknown): Error {
  if (err instanceof ZodError) return new core.CommandError(formatZodError(err));
  if (err instanceof Error) return err;
  return new Error(String(err));
}
