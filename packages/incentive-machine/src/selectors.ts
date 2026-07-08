import type { StateFrom } from "xstate";
import type { Incentive } from "@32dashboards/schema";
import type { incentiveMachine } from "./machine.js";

type IncentiveMachineSnapshot = StateFrom<typeof incentiveMachine>;

function activeIncentives(incentives: Incentive[]): Incentive[] {
  return incentives.filter((i) => i.active);
}

export function selectCurrentIncentive(state: IncentiveMachineSnapshot): Incentive | null {
  const ctx = state.context;

  if (state.matches("showingNow")) {
    return activeIncentives(ctx.incentives).find((i) => i.displayNow) ?? null;
  }
  if (state.matches("showingUntil")) {
    return activeIncentives(ctx.incentives).find((i) => i.displayUntilMet && ctx.totalRaised < i.target) ?? null;
  }
  if (state.matches("showingCycle")) {
    const active = activeIncentives(ctx.incentives);
    if (active.length === 0) return null;
    const index = ((ctx.cycleIndex % active.length) + active.length) % active.length;
    return active[index] ?? null;
  }
  if (state.matches({ celebrating: "message" }) || state.matches({ celebrating: "detail" })) {
    const id = ctx.celebrationQueue[0];
    return ctx.incentives.find((i) => i.id === id) ?? null;
  }
  return null;
}

export function selectIsCelebrating(state: IncentiveMachineSnapshot): boolean {
  return state.matches("celebrating");
}

export function selectCelebrationStage(state: IncentiveMachineSnapshot): "message" | "detail" | null {
  if (state.matches({ celebrating: "message" })) return "message";
  if (state.matches({ celebrating: "detail" })) return "detail";
  return null;
}
