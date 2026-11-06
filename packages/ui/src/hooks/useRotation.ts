import { useEffect, useRef, useState } from "react";

/**
 * Steps through a list `size` at a time, every `ms`, wrapping around. The
 * position survives the list changing: on a busy night items gain bids and
 * move around all the time, and starting over each time would show only the
 * first few. Returns the items to show now, and a number that changes with
 * each step (a key, for an entrance).
 *
 * While `active` is false (another view is taking its turn) it waits. If a
 * whole turn went by without a step, it moves on anyway, so every turn shows
 * something new however short it is.
 */
export function useRotation<T>(items: T[], size: number, ms: number, active = true): { visible: T[]; step: number } {
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState(0);
  const length = items.length;

  const movedThisTurn = useRef(false);
  const wasActive = useRef(active);
  const advance = () => {
    setPosition((p) => (p + size) % length);
    setStep((s) => s + 1);
  };

  useEffect(() => {
    if (!active || length <= size) return;
    const interval = setInterval(() => {
      movedThisTurn.current = true;
      advance();
    }, ms);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, length, ms, size]);

  useEffect(() => {
    if (wasActive.current && !active && !movedThisTurn.current && length > size) advance();
    if (active) movedThisTurn.current = false;
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const start = length > size ? position % length : 0;
  const visible = Array.from({ length: Math.min(size, length) }, (_, i) => items[(start + i) % length]!);
  return { visible, step };
}
