import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import {
  incentiveMachine,
  selectCelebrationStage,
  selectCurrentIncentive,
  selectIsCelebrating,
} from "@32dashboards/incentive-machine";
import type { Incentive } from "@32dashboards/schema";

export interface UseIncentiveMachineResult {
  currentIncentive: Incentive | null;
  isCelebrating: boolean;
  celebrationStage: "message" | "detail" | null;
  onMarqueeCycleComplete: () => void;
}

/** Thin app-level wrapper composing the generic incentive-machine with this app's live data. */
export function useIncentiveMachine(incentives: Incentive[], totalRaised: number): UseIncentiveMachineResult {
  const [state, send] = useMachine(incentiveMachine, { input: { incentives, totalRaised } });

  useEffect(() => {
    send({ type: "CONFIG_UPDATED", incentives, totalRaised });
    // Intentionally omitting `send` (stable per XState) from deps; re-firing
    // only when the actual data changes is the desired behavior here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incentives, totalRaised]);

  return {
    currentIncentive: selectCurrentIncentive(state),
    isCelebrating: selectIsCelebrating(state),
    celebrationStage: selectCelebrationStage(state),
    onMarqueeCycleComplete: () => send({ type: "MARQUEE_CYCLE_COMPLETE" }),
  };
}
