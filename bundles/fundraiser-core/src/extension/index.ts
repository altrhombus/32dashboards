import { randomUUID } from "node:crypto";
import path from "node:path";
import type NodeCG from "nodecg/types";
import type { z } from "zod";
import {
  EventsReplicantSchema,
  MOMENTS_LIMIT,
  askMeProgress,
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
  type SceneId,
  type SceneReplicant,
  type ScreensReplicant,
  type SourceLogReplicant,
  type SourceResultsReplicant,
  type TotalPeaksReplicant,
} from "@32dashboards/schema/core";
import { CommandError, formatZodError, listenForCommand, plain } from "@32dashboards/source-sdk";
import type { FundraiserCoreApi } from "./api.js";
import { importAsset } from "./importAsset.js";
import { lanAddresses } from "./network.js";
import { DonationLedger } from "./donations.js";
import * as core from "./state.js";

export type { FundraiserCoreApi, ReportOutcome, SourceHandle } from "./api.js";

const deps: core.Deps = { now: () => new Date().toISOString(), newId: randomUUID };

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
  // Kept across restarts (it's capped at MOMENTS_LIMIT), so the TVs' latest bids and the console's
  // list of what the TV celebrated don't go blank when NodeCG restarts mid-event.
  const moments = nodecg.Replicant<MomentsReplicant>("moments", { defaultValue: [] });
  const totalPeaks = nodecg.Replicant<TotalPeaksReplicant>("totalPeaks", { defaultValue: {} });
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

  // Money the bids don't explain is thanked as a donation, once it's clear it isn't a bid that
  // the auction's total showed a refresh before the item did (see donations.ts).
  const donations = new DonationLedger();
  const donationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const thankDonations = (eventId: string) => {
    const amount = donations.due(eventId, Date.now());
    const state = read();
    if (amount >= 1 && state.activeEventId === eventId) {
      recordMoments([
        {
          kind: "total-increase",
          id: deps.newId(),
          eventId,
          at: deps.now(),
          delta: amount,
          total: core.computeLiveState(state).total,
        },
      ]);
    }
    // Check back when the next one could be due, even if no new result arrives by then.
    clearTimeout(donationTimers.get(eventId));
    const next = donations.nextDue(eventId);
    if (next !== null)
      donationTimers.set(
        eventId,
        setTimeout(() => thankDonations(eventId), Math.max(0, next - Date.now()) + 50).unref(),
      );
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
  // Set around a change that moves the total without new money, so it can't cross a milestone.
  let quiet = false;
  const setPeak = (eventId: string, total: number) => {
    totalPeaks.value = { ...plain(totalPeaks.value ?? {}), [eventId]: total };
  };
  const refreshLiveState = () => {
    const next = core.computeLiveState(read());
    const serialized = JSON.stringify(next);
    if (serialized === lastLiveJson) return;
    const id = next.event?.id;
    const stored = id ? totalPeaks.value?.[id] : undefined;
    // An event from before peaks were kept, or just started: what was showing is the high so far.
    const peak = stored ?? (lastLive.event?.id === id ? lastLive.total : 0);
    const crossed = quiet ? [] : core.detectThresholdMoments(lastLive, next, deps, peak);
    lastLive = next;
    lastLiveJson = serialized;
    liveState.value = next;
    if (id && (stored === undefined || next.total > peak)) setPeak(id, Math.max(peak, next.total));
    recordMoments(crossed);
  };
  /** Runs a change that isn't money coming in: the new total stands, but nothing is celebrated. */
  const quietly = (change: () => void) => {
    quiet = true;
    change();
    refreshLiveState();
    quiet = false;
  };
  /** An operator took money off: it never was raised, so milestones above it can be reached again. */
  const lowerPeak = (state: core.CoreState) => {
    const { event, total } = core.computeLiveState(state);
    if (event && total < (totalPeaks.value?.[event.id] ?? 0)) setPeak(event.id, total);
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
  listenForCommand(nodecg, "deleteEvent", coreMessageSchemas.deleteEvent, ({ eventId }) => {
    const before = read();
    write(before, core.deleteEvent(before, eventId));
    const { [eventId]: _deleted, ...rest } = plain(totalPeaks.value ?? {});
    totalPeaks.value = rest;
  });
  command("activateEvent", (state, { eventId }) => ({ state: core.activateEvent(state, eventId) }));
  listenForCommand(nodecg, "setAdjustment", coreMessageSchemas.setAdjustment, ({ eventId, amount }) => {
    const before = read();
    const after = core.setAdjustment(before, eventId, amount, deps);
    quietly(() => write(before, after));
    lowerPeak(after);
  });
  listenForCommand(nodecg, "nudgeAdjustment", coreMessageSchemas.nudgeAdjustment, ({ eventId, delta, quiet }) => {
    const before = read();
    const after = core.nudgeAdjustment(before, eventId, delta, deps);
    if (quiet) quietly(() => write(before, after));
    else write(before, after);
    if (delta < 0) lowerPeak(after);
    // Money added at the venue (cash, checks) is a donation too; a correction
    // downward, setAdjustment, or undoing an earlier action isn't celebrated.
    if (delta > 0 && !quiet && after.activeEventId === eventId) {
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
  command("nudgeAskMe", (state, { eventId, delta, round }) => ({
    state: core.nudgeAskMe(state, eventId, delta, deps, round),
  }));
  listenForCommand(nodecg, "finishAskMeRound", coreMessageSchemas.finishAskMeRound, ({ eventId, amount, roundId }) => {
    const before = read();
    const event = before.events.find((e) => e.id === eventId);
    const progress = event ? askMeProgress(event) : null;
    const after = core.finishAskMeRound(before, eventId, amount, roundId, deps);
    write(before, after);
    // Ask Me is done (the last planned round, or the one appeal without a
    // plan): the TVs go back to the scene before it, where the wrap-up plays.
    const left = after.events.find((e) => e.id === eventId);
    const done = left ? askMeProgress(left) : null;
    if (done && (done.done || done.count === 0) && after.activeEventId === eventId && scene.value?.id === "askMe") {
      switchTo(beforeAskMe.id, beforeAskMe.countdownTo, beforeAskMe.message);
    }
    // The TV wraps the round up (a round that raised nothing just moves on).
    const finished = after.events.find((e) => e.id === eventId);
    if (amount > 0 && progress && finished && after.activeEventId === eventId) {
      recordMoments([
        {
          kind: "askme-round",
          id: deps.newId(),
          eventId,
          at: deps.now(),
          amount,
          total: core.computeLiveState(after).total,
          title: progress.title,
          number: progress.number,
          count: progress.count,
          raisedTonight: finished.askMeRaised,
        },
      ]);
    }
  });
  listenForCommand(nodecg, "reopenAskMeRound", coreMessageSchemas.reopenAskMeRound, ({ eventId, amount, roundId }) => {
    const before = read();
    const after = core.reopenAskMeRound(before, eventId, amount, roundId, deps);
    write(before, after);
    lowerPeak(after);
  });
  command("setFilters", (state, { eventId, filters }) => ({
    state: core.setFilters(state, eventId, filters, deps),
  }));

  command("nudgeBidWar", (state, input) => ({ state: core.nudgeBidWar(state, input, deps) }));
  command("pinIncentive", (state, { eventId, incentiveId }) => ({
    state: core.pinIncentive(state, eventId, incentiveId, deps),
  }));
  listenForCommand(nodecg, "clearMoments", coreMessageSchemas.clearMoments, () => {
    moments.value = [];
  });

  // The scene Ask Me was put on over, to go back to once Ask Me is done (in memory; Main after a restart).
  let beforeAskMe: { id: SceneId; countdownTo: string | null; message: string | null } = {
    id: "main",
    countdownTo: null,
    message: null,
  };
  const switchTo = (id: SceneId, countdownTo: string | null = null, message: string | null = null) => {
    const current = scene.value;
    if (id === "askMe" && current && current.id !== "askMe") {
      beforeAskMe = ["welcome", "main", "noBids", "intermission"].includes(current.id)
        ? { id: current.id, countdownTo: current.countdownTo, message: current.message }
        : { id: "main", countdownTo: null, message: null };
    }
    scene.value = { id, countdownTo, message, changedAt: deps.now() };
  };

  listenForCommand(nodecg, "switchScene", coreMessageSchemas.switchScene, ({ id, countdownTo, message }) => {
    switchTo(id, countdownTo ?? null, message ?? null);
  });

  // As bidding closes, the TVs call attention to it: 10, 5 and 1 minute
  // left, then closed (and, if the event asks, the Celebration scene). Each
  // fires once, and only within a short window after its time, so a restart
  // doesn't replay old ones.
  const LAST_CALLS = [10, 5, 1, 0];
  const LAST_CALL_WINDOW_MS = 45_000;
  const lastCallsSent = new Set<string>();
  const checkLastCall = () => {
    const state = read();
    const event = state.events.find((e) => e.id === state.activeEventId);
    if (!event?.endDateTime) return;
    const remaining = Date.parse(event.endDateTime) - Date.now();
    for (const minutesLeft of LAST_CALLS) {
      const at = minutesLeft * 60_000;
      const key = `${event.id}|${event.endDateTime}|${minutesLeft}`;
      if (remaining > at || remaining <= at - LAST_CALL_WINDOW_MS || lastCallsSent.has(key)) continue;
      lastCallsSent.add(key);
      recordMoments([{ kind: "last-call", id: deps.newId(), eventId: event.id, at: deps.now(), minutesLeft }]);
      if (minutesLeft === 0 && event.celebrateAtClose && !["celebration", "askMe"].includes(scene.value?.id ?? "")) {
        switchTo("celebration");
      }
    }
  };
  setInterval(checkLastCall, 5_000).unref();

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

  // The bundle lives at <runtime root>/bundles/fundraiser-core; NodeCG keeps assets in <runtime root>/assets.
  const assetsRoot = path.resolve(__dirname, "..", "..", "..", "assets");
  listenForCommand(nodecg, "importAsset", coreMessageSchemas.importAsset, ({ category, url, name }) =>
    importAsset({ assetsRoot, namespace: nodecg.bundleName, category, url, name }),
  );

  // Where a phone on the venue network can open the dashboard (the console's "Open on your phone").
  listenForCommand(nodecg, "connectionInfo", coreMessageSchemas.connectionInfo, () => ({
    port: (nodecg.config as { port?: number }).port ?? 9090,
    addresses: lanAddresses(),
  }));

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
    registerSource(sourceId, { label, handEntered = false }) {
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
        report({ baseline = false, ...input }) {
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
          const previous = before.sourceResults[parsed.data.eventId];
          // The first result only says where the total stood, unless the operator typed it in.
          const startsOver = baseline || (!previous && !handEntered);
          const compared =
            event && state.activeEventId === event.id && !startsOver
              ? core.compareResults(previous, parsed.data, event, deps)
              : null;
          if (startsOver) quietly(() => write(before, state));
          else write(before, state);
          updateSource(sourceId, { lastResultAt: deps.now() });
          if (compared && event) {
            recordMoments(compared.bids);
            donations.observe(event.id, compared.totalDelta, compared.fromBids, Date.now());
            thankDonations(event.id);
          }
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
