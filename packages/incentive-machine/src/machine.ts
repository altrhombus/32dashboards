import { assign, setup } from "xstate";
import type { Incentive } from "@32dashboards/schema";

/**
 * Mirrors packages/ui/tokens durations.incentiveCelebrationMessageMs/DetailMs.
 * Duplicated intentionally: this package stays framework/UI-independent
 * (unit-tested in isolation, per the plan) rather than depending on the
 * React/DOM-carrying @32dashboards/ui package for two numbers.
 */
export const CELEBRATION_MESSAGE_MS = 4_500;
export const CELEBRATION_DETAIL_MS = 5_000;

export interface IncentiveMachineInput {
  incentives: Incentive[];
  totalRaised: number;
}

export interface IncentiveMachineContext {
  incentives: Incentive[];
  totalRaised: number;
  /** Incentive ids already celebrated once -- prevents re-celebrating on every subsequent update. */
  metIncentiveIds: Set<string>;
  /** FIFO queue of incentive ids awaiting their celebration; drained one at a time. */
  celebrationQueue: string[];
  cycleIndex: number;
}

export type IncentiveMachineEvent =
  | { type: "CONFIG_UPDATED"; incentives: Incentive[]; totalRaised: number }
  | { type: "MARQUEE_CYCLE_COMPLETE" };

function activeIncentives(incentives: Incentive[]): Incentive[] {
  return incentives.filter((i) => i.active);
}

function isMet(incentive: Incentive, totalRaised: number): boolean {
  return totalRaised >= incentive.target;
}

/**
 * Every state needs the same CONFIG_UPDATED priority resolution: a newly-met
 * incentive queues a celebration; otherwise displayNow beats displayUntilMet
 * beats whatever this state's own fallback is. Centralized here (rather than
 * hand-duplicated per state, as an earlier version of this file did) after a
 * live bug: scroller's copy omitted the celebration/priority checks entirely
 * and used a targetless transition, so `always` (which only re-evaluates on
 * actual state entry) never re-ran, leaving a newly-flagged displayNow
 * incentive stuck invisible. Every branch below has an explicit target,
 * including self-targets, so every CONFIG_UPDATED always causes a real
 * (re-)entry and `always` blocks stay reliable as a defense-in-depth backstop.
 */
function configUpdatedTransitions(fallbackTarget: string) {
  return [
    { guard: "hasNewlyMetInEvent", target: "#incentive.celebrating", actions: "ingestConfig" },
    { guard: "hasDisplayNow", target: "#incentive.showingNow", actions: "ingestConfig" },
    { guard: "hasDisplayUntilMet", target: "#incentive.showingUntil", actions: "ingestConfig" },
    { target: fallbackTarget, actions: "ingestConfig" },
  ] as const;
}

export const incentiveMachine = setup({
  types: {
    context: {} as IncentiveMachineContext,
    events: {} as IncentiveMachineEvent,
    input: {} as IncentiveMachineInput,
  },
  actions: {
    ingestConfig: assign(({ context, event }) => {
      if (event.type !== "CONFIG_UPDATED") return {};
      const newlyMet = activeIncentives(event.incentives).filter(
        (i) => isMet(i, event.totalRaised) && !context.metIncentiveIds.has(i.id)
      );
      const metIncentiveIds = new Set(context.metIncentiveIds);
      for (const incentive of newlyMet) metIncentiveIds.add(incentive.id);
      return {
        incentives: event.incentives,
        totalRaised: event.totalRaised,
        metIncentiveIds,
        celebrationQueue: [...context.celebrationQueue, ...newlyMet.map((i) => i.id)],
      };
    }),
    advanceCycle: assign(({ context }) => {
      const active = activeIncentives(context.incentives);
      if (active.length === 0) return { cycleIndex: 0 };
      return { cycleIndex: (context.cycleIndex + 1 + active.length) % active.length };
    }),
    popCelebrationQueue: assign(({ context }) => ({
      celebrationQueue: context.celebrationQueue.slice(1),
    })),
  },
  guards: {
    hasCelebrationQueued: ({ context }) => context.celebrationQueue.length > 0,
    // These two read from the incoming event (when there is one) rather
    // than context: within a single CONFIG_UPDATED transition, the guard
    // choosing which branch to take runs against context as it was BEFORE
    // this step's ingestConfig action commits, so reading context here
    // would see stale data (e.g. a displayNow:false update would still
    // see the previous displayNow:true and never fall through to scroller).
    hasDisplayNow: ({ context, event }) => {
      const incentives = event.type === "CONFIG_UPDATED" ? event.incentives : context.incentives;
      return activeIncentives(incentives).some((i) => i.displayNow);
    },
    hasDisplayUntilMet: ({ context, event }) => {
      const incentives = event.type === "CONFIG_UPDATED" ? event.incentives : context.incentives;
      const totalRaised = event.type === "CONFIG_UPDATED" ? event.totalRaised : context.totalRaised;
      return activeIncentives(incentives).some((i) => i.displayUntilMet && !isMet(i, totalRaised));
    },
    hasActiveIncentives: ({ context }) => activeIncentives(context.incentives).length > 0,
    // Same event-vs-context reasoning as above: celebrationQueue is only
    // populated by ingestConfig's assign, which hasn't committed yet when
    // this guard runs, so "does THIS event introduce a newly-met incentive"
    // must be computed directly from the event, not from context.celebrationQueue.
    hasNewlyMetInEvent: ({ context, event }) => {
      if (event.type !== "CONFIG_UPDATED") return false;
      return activeIncentives(event.incentives).some(
        (i) => isMet(i, event.totalRaised) && !context.metIncentiveIds.has(i.id)
      );
    },
  },
  delays: {
    celebrationMessage: CELEBRATION_MESSAGE_MS,
    celebrationDetail: CELEBRATION_DETAIL_MS,
  },
}).createMachine({
  id: "incentive",
  context: ({ input }) => ({
    incentives: input?.incentives ?? [],
    totalRaised: input?.totalRaised ?? 0,
    metIncentiveIds: new Set(),
    celebrationQueue: [],
    cycleIndex: -1,
  }),
  initial: "scroller",
  states: {
    // Marquee visible, no incentive card -- the default resting state.
    // `always` here matters specifically for machine construction: it's
    // the only way pre-existing input (rather than a later CONFIG_UPDATED
    // event) gets acted on, since scroller is the initial state.
    scroller: {
      always: [
        { guard: "hasDisplayNow", target: "#incentive.showingNow" },
        { guard: "hasDisplayUntilMet", target: "#incentive.showingUntil" },
      ],
      on: {
        CONFIG_UPDATED: configUpdatedTransitions("#incentive.scroller"),
        MARQUEE_CYCLE_COMPLETE: {
          guard: "hasActiveIncentives",
          target: "showingCycle",
          actions: "advanceCycle",
        },
      },
    },
    // Admin pinned a specific incentive on screen (stays pinned until the
    // admin unpins it -- see note in README.md in this package about why
    // this differs from legacy's self-clearing one-shot flash).
    showingNow: {
      on: {
        CONFIG_UPDATED: configUpdatedTransitions("#incentive.scroller"),
      },
    },
    // An incentive flagged displayUntilMet, still unmet -- shown continuously.
    showingUntil: {
      on: {
        CONFIG_UPDATED: configUpdatedTransitions("#incentive.scroller"),
      },
    },
    // Rotating through all active incentives, one per completed marquee lap.
    showingCycle: {
      on: {
        CONFIG_UPDATED: configUpdatedTransitions("#incentive.showingCycle"),
        MARQUEE_CYCLE_COMPLETE: { actions: "advanceCycle" },
      },
    },
    // Drains celebrationQueue one incentive at a time: message stage, then
    // detail stage, then resolves to whatever should show next -- this is
    // what guarantees two simultaneously-met incentives celebrate in
    // sequence rather than overlapping.
    celebrating: {
      initial: "message",
      on: {
        CONFIG_UPDATED: { actions: "ingestConfig" },
      },
      states: {
        message: {
          after: { celebrationMessage: "detail" },
        },
        detail: {
          after: { celebrationDetail: "#incentive.resolvingAfterCelebration" },
        },
      },
    },
    resolvingAfterCelebration: {
      entry: "popCelebrationQueue",
      always: [
        { guard: "hasCelebrationQueued", target: "#incentive.celebrating" },
        { guard: "hasDisplayNow", target: "#incentive.showingNow" },
        { guard: "hasDisplayUntilMet", target: "#incentive.showingUntil" },
        { target: "#incentive.scroller" },
      ],
    },
  },
});

export type IncentiveMachine = typeof incentiveMachine;
