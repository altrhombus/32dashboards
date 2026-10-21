import { randomUUID } from "node:crypto";
import type NodeCG from "nodecg/types";
import type { z } from "zod";
import {
  EventsReplicantSchema,
  MOMENTS_LIMIT,
  SOURCE_LOG_LIMIT,
  SourceResultSchema,
  coreMessageSchemas,
  type ActiveEventIdReplicant,
  type CoreMessageName,
  type EventsReplicant,
  type FundraiserEvent,
  type LiveStateReplicant,
  type MomentsReplicant,
  type OutputsReplicant,
  type RegisteredSource,
  type RegisteredSourcesReplicant,
  type SceneReplicant,
  type ScreensReplicant,
  type SourceLogReplicant,
  type SourceResultsReplicant,
} from "@32dashboards/schema/core";
import { CommandError, formatZodError, listenForCommand } from "@32dashboards/source-sdk";
import type { FundraiserCoreApi } from "./api.js";
import * as core from "./state.js";

export type { FundraiserCoreApi, ReportOutcome, SourceHandle } from "./api.js";

const deps: core.Deps = { now: () => new Date().toISOString(), newId: randomUUID };

/** Copies a value out of NodeCG's change-tracking proxy. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Runs every listener, logging (not propagating) failures so one bad adapter can't break the core. */
function notify<A extends unknown[]>(nodecg: NodeCG.ServerAPI, listeners: Set<(...args: A) => void>, ...args: A): void {
  for (const listener of listeners) {
    try {
      listener(...args);
    } catch (err) {
      nodecg.log.error("Listener threw:", err);
    }
  }
}

function subscribe<L>(listeners: Set<L>, listener: L): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function fundraiserCore(nodecg: NodeCG.ServerAPI): FundraiserCoreApi {
  const events = nodecg.Replicant<EventsReplicant>("events", { defaultValue: [] });
  const activeEventId = nodecg.Replicant<ActiveEventIdReplicant>("activeEventId", { defaultValue: null });
  const sourceResults = nodecg.Replicant<SourceResultsReplicant>("sourceResults", { defaultValue: {} });
  const sources = nodecg.Replicant<RegisteredSourcesReplicant>("sources", { defaultValue: [], persistent: false });
  const sourceLog = nodecg.Replicant<SourceLogReplicant>("sourceLog", { defaultValue: [], persistent: false });
  const moments = nodecg.Replicant<MomentsReplicant>("moments", { defaultValue: [], persistent: false });
  const outputs = nodecg.Replicant<OutputsReplicant>("outputs", { defaultValue: [], persistent: false });
  const screens = nodecg.Replicant<ScreensReplicant>("screens", { defaultValue: [] });
  const scene = nodecg.Replicant<SceneReplicant>("scene", {
    defaultValue: { id: "main", countdownTo: null, message: null, changedAt: deps.now() },
  });

  // Events saved by an older version lack newer fields; fill their defaults
  // once at startup so everything downstream can rely on the full shape.
  const upgraded = EventsReplicantSchema.safeParse(plain(events.value ?? []));
  if (!upgraded.success) {
    nodecg.log.error(`Stored events don't match the schema; leaving them as-is: ${formatZodError(upgraded.error)}`);
  } else if (JSON.stringify(upgraded.data) !== JSON.stringify(events.value)) {
    events.value = upgraded.data;
    nodecg.log.info("Upgraded stored events to the current schema");
  }

  const recordMoments = (found: MomentsReplicant) => {
    if (found.length === 0) return;
    moments.value = [...plain(moments.value ?? []), ...found].slice(-MOMENTS_LIMIT);
    for (const moment of found) nodecg.sendMessage("donationMoment", moment);
  };

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
  // It's also where milestones and incentive targets are detected, since
  // that's the one place every change to the displayed total passes through.
  let lastLive = core.computeLiveState(read());
  let lastLiveJson = JSON.stringify(liveState.value);
  const refreshLiveState = () => {
    const next = core.computeLiveState(read());
    const serialized = JSON.stringify(next);
    if (serialized === lastLiveJson) return;
    const crossed = core.detectThresholdMoments(lastLive, next, deps);
    lastLive = next;
    lastLiveJson = serialized;
    liveState.value = next;
    recordMoments(crossed);
  };

  const activeListeners = new Set<(eventId: string | null) => void>();
  const eventsListeners = new Set<(events: FundraiserEvent[]) => void>();
  const duplicateListeners = new Set<(from: string, to: string) => void>();
  const refreshListeners = new Map<string, Set<(eventId: string) => void>>();

  let lastActive = activeEventId.value ?? null;
  activeEventId.on("change", () => {
    refreshLiveState();
    const current = activeEventId.value ?? null;
    if (current === lastActive) return;
    lastActive = current;
    moments.value = [];
    notify(nodecg, activeListeners, current);
  });
  events.on("change", () => {
    refreshLiveState();
    notify(nodecg, eventsListeners, plain(events.value ?? []));
  });
  sourceResults.on("change", refreshLiveState);
  refreshLiveState();

  /** Registers a Message whose command is a pure state transition. */
  function command<N extends CoreMessageName>(
    name: N,
    run: (
      state: core.CoreState,
      payload: z.output<(typeof coreMessageSchemas)[N]>,
    ) => {
      state: core.CoreState;
      reply?: unknown;
    },
  ) {
    listenForCommand(nodecg, name, coreMessageSchemas[name], (payload) => {
      const before = read();
      const result = run(before, payload as z.output<(typeof coreMessageSchemas)[N]>);
      write(before, result.state);
      return result.reply;
    });
  }

  command("createEvent", (state, input) => {
    const { state: next, eventId } = core.createEvent(state, input, deps);
    return { state: next, reply: eventId };
  });
  command("updateEvent", (state, input) => ({ state: core.updateEvent(state, input, deps) }));
  command("duplicateEvent", (state, input) => {
    const { state: next, eventId } = core.duplicateEvent(state, input, deps);
    // Adapters copy their per-event settings once the copy exists.
    queueMicrotask(() => notify(nodecg, duplicateListeners, input.eventId, eventId));
    return { state: next, reply: eventId };
  });
  command("deleteEvent", (state, { eventId }) => ({ state: core.deleteEvent(state, eventId) }));
  command("activateEvent", (state, { eventId }) => ({ state: core.activateEvent(state, eventId) }));
  command("setAdjustment", (state, { eventId, amount }) => ({
    state: core.setAdjustment(state, eventId, amount, deps),
  }));
  listenForCommand(nodecg, "nudgeAdjustment", coreMessageSchemas.nudgeAdjustment, ({ eventId, delta }) => {
    const before = read();
    const after = core.nudgeAdjustment(before, eventId, delta, deps);
    write(before, after);
    // Money added at the venue (cash, checks) is a donation too; a
    // correction downward, or setAdjustment, isn't celebrated.
    if (delta > 0 && after.activeEventId === eventId) {
      recordMoments([
        {
          kind: "total-increase",
          id: deps.newId(),
          eventId,
          at: deps.now(),
          delta,
          total: core.computeLiveState(after).total,
        },
      ]);
    }
  });
  command("nudgeAskMe", (state, { eventId, delta }) => ({ state: core.nudgeAskMe(state, eventId, delta, deps) }));
  command("setFilters", (state, { eventId, filters }) => ({
    state: core.setFilters(state, eventId, filters, deps),
  }));

  command("nudgeBidWar", (state, input) => ({ state: core.nudgeBidWar(state, input, deps) }));

  listenForCommand(nodecg, "switchScene", coreMessageSchemas.switchScene, ({ id, countdownTo, message }) => {
    scene.value = { id, countdownTo: countdownTo ?? null, message: message ?? null, changedAt: deps.now() };
  });

  // Outputs check in every few seconds; ones that stop are dropped.
  const OUTPUT_TIMEOUT_MS = 60_000;
  const pruneOutputs = () => {
    const cutoff = Date.now() - OUTPUT_TIMEOUT_MS;
    const current = plain(outputs.value ?? []);
    const live = current.filter((o) => Date.parse(o.lastSeenAt) >= cutoff);
    if (live.length !== current.length) outputs.value = live;
  };
  setInterval(pruneOutputs, 15_000).unref();
  listenForCommand(
    nodecg,
    "outputHeartbeat",
    coreMessageSchemas.outputHeartbeat,
    ({ instanceId, output, screenId = null }) => {
      const now = deps.now();
      const current = plain(outputs.value ?? []);
      const existing = current.find((o) => o.instanceId === instanceId);
      outputs.value = existing
        ? current.map((o) => (o === existing ? { ...o, output, screenId, lastSeenAt: now } : o))
        : [...current, { instanceId, output, screenId, firstSeenAt: now, lastSeenAt: now }];
      pruneOutputs();
    },
  );

  listenForCommand(nodecg, "saveScreen", coreMessageSchemas.saveScreen, (screen) => {
    const current = plain(screens.value ?? []);
    screens.value = core.saveScreen(current, screen);
  });
  listenForCommand(nodecg, "deleteScreen", coreMessageSchemas.deleteScreen, ({ id }) => {
    screens.value = core.deleteScreen(plain(screens.value ?? []), id);
  });

  listenForCommand(nodecg, "refreshSource", coreMessageSchemas.refreshSource, ({ eventId }) => {
    const event = events.value?.find((e) => e.id === eventId);
    if (!event) throw new CommandError(`No event with id ${eventId}`);
    const adapterId = event.source.adapterId;
    const listeners = adapterId ? refreshListeners.get(adapterId) : undefined;
    if (!adapterId) throw new CommandError("This event has no source.");
    if (!listeners?.size) throw new CommandError(`Source "${adapterId}" isn't running.`);
    notify(nodecg, listeners, eventId);
  });

  const updateSource = (sourceId: string, patch: Partial<RegisteredSource>) => {
    sources.value = plain(sources.value ?? []).map((s) => (s.id === sourceId ? { ...s, ...patch } : s));
  };

  const appendLog = (entry: SourceLogReplicant[number]) => {
    sourceLog.value = [...plain(sourceLog.value ?? []), entry].slice(-SOURCE_LOG_LIMIT);
  };

  return {
    registerSource(sourceId, { label }) {
      if (refreshListeners.has(sourceId)) throw new Error(`Source "${sourceId}" is already registered`);
      const listeners = new Set<(eventId: string) => void>();
      refreshListeners.set(sourceId, listeners);
      const registeredAt = deps.now();
      sources.value = [
        ...plain(sources.value ?? []),
        {
          id: sourceId,
          label,
          registeredAt,
          status: { state: "idle", message: null, eventId: null, updatedAt: registeredAt },
          lastResultAt: null,
        },
      ];
      nodecg.log.info(`Source registered: ${sourceId}`);

      const log: ReturnType<FundraiserCoreApi["registerSource"]>["log"] = (level, message, eventId = null) => {
        appendLog({ at: deps.now(), sourceId, level, message: message.slice(0, 1000), eventId });
        nodecg.log[level](`[${sourceId}] ${message}`);
      };

      return {
        sourceId,
        report(input) {
          const parsed = SourceResultSchema.safeParse({ ...input, sourceId });
          if (!parsed.success) {
            log("warn", `Invalid result: ${formatZodError(parsed.error)}`, null);
            return "invalid";
          }
          const before = read();
          const { state, outcome } = core.recordSourceResult(before, parsed.data);
          if (outcome !== "stored") {
            log("warn", `Result ignored: ${outcome}`, parsed.data.eventId);
            return outcome;
          }
          const event = state.events.find((e) => e.id === parsed.data.eventId);
          const found =
            event && state.activeEventId === event.id
              ? core.detectMoments(before.sourceResults[event.id], parsed.data, event, deps)
              : [];
          write(before, state);
          updateSource(sourceId, { lastResultAt: deps.now() });
          recordMoments(found);
          return outcome;
        },
        setStatus({ state, message = null, eventId = null }) {
          updateSource(sourceId, {
            status: { state, message: message?.slice(0, 500) ?? null, eventId, updatedAt: deps.now() },
          });
        },
        log,
        onRefreshRequested: (listener) => subscribe(listeners, listener),
      };
    },
    getActiveEventId: () => activeEventId.value ?? null,
    getEvent: (eventId) => {
      const event = events.value?.find((e) => e.id === eventId);
      return event ? plain(event) : undefined;
    },
    listEvents: () => plain(events.value ?? []),
    onActiveEventChange: (listener) => subscribe(activeListeners, listener),
    onEventsChange: (listener) => subscribe(eventsListeners, listener),
    onEventDuplicated: (listener) => subscribe(duplicateListeners, listener),
  };
}
