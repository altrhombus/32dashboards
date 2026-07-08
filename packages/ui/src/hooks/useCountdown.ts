import { useEffect, useRef, useState } from "react";
import { durations } from "../tokens/tokens.js";

export interface CountdownState {
  hours: number;
  minutes: number;
  seconds: number;
  /** Only populated in the final 5 minutes, matching legacy display behavior. */
  tenths: number | null;
  totalMs: number;
  isExpired: boolean;
}

function computeState(endDateTime: string | null): CountdownState {
  if (!endDateTime) {
    return { hours: 0, minutes: 0, seconds: 0, tenths: null, totalMs: 0, isExpired: false };
  }
  const rawMs = new Date(endDateTime).getTime() - Date.now();
  const clampedMs = Math.max(rawMs, 0);
  const totalSeconds = Math.floor(clampedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = clampedMs < durations.countdownTenthsThresholdMs ? Math.floor((clampedMs % 1000) / 100) : null;
  return { hours, minutes, seconds, tenths, totalMs: clampedMs, isExpired: rawMs <= 0 };
}

/** Ticks at 100ms (matching legacy) so sub-5-minute tenths-of-a-second display stays smooth. */
export function useCountdown(endDateTime: string | null, onExpire?: () => void): CountdownState {
  const [state, setState] = useState<CountdownState>(() => computeState(endDateTime));
  const hasFiredExpireRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    hasFiredExpireRef.current = false;
    setState(computeState(endDateTime));

    const interval = setInterval(() => {
      const next = computeState(endDateTime);
      setState(next);
      if (next.isExpired && !hasFiredExpireRef.current) {
        hasFiredExpireRef.current = true;
        onExpireRef.current?.();
      }
    }, durations.countdownTickMs);

    return () => clearInterval(interval);
  }, [endDateTime]);

  return state;
}
