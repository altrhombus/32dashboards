import { useEffect, useState } from "react";

/**
 * Steps through a list `size` at a time, every `ms`, wrapping around. The
 * position survives the list changing: on a busy night items gain bids and
 * move around all the time, and starting over each time would show only the
 * first few. Returns the items to show now, and a number that changes with
 * each step (a key, for an entrance).
 */
export function useRotation<T>(items: T[], size: number, ms: number): { visible: T[]; step: number } {
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState(0);
  const length = items.length;

  useEffect(() => {
    if (length <= size) return;
    const interval = setInterval(() => {
      setPosition((p) => (p + size) % length);
      setStep((s) => s + 1);
    }, ms);
    return () => clearInterval(interval);
  }, [length, ms, size]);

  const start = length > size ? position % length : 0;
  const visible = Array.from({ length: Math.min(size, length) }, (_, i) => items[(start + i) % length]!);
  return { visible, step };
}
