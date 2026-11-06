import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DonationMoment } from "@32dashboards/schema/core";
import { MAX_TOASTS, TOAST_BUSY_MS, TOAST_GAP_MS, TOAST_MS, useDonationMoments } from "../src/useShow.js";

const EVENT = "00000000-0000-4000-8000-000000000001";
let listener: ((moment: DonationMoment) => void) | null = null;
const bid = (n: number): DonationMoment => ({
  kind: "new-bid",
  id: `00000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`,
  eventId: EVENT,
  at: "2026-11-07T20:00:00.000Z",
  itemId: `item-${n}`,
  itemTitle: `Item ${n}`,
  amount: 10 * n,
  bidCount: 1,
  newBids: 1,
});

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("nodecg", {
      listenFor: (_name: string, _bundle: string, handler: (m: DonationMoment) => void) => (listener = handler),
      unlisten: () => (listener = null),
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a burst of bids one by one, a few at a time, without dropping any", () => {
    const { result } = renderHook(() => useDonationMoments(EVENT, () => {}));
    act(() => {
      for (let n = 1; n <= 6; n++) listener!(bid(n));
    });
    expect(result.current.toasts.map((t) => t.id)).toEqual([bid(1).id]);

    act(() => vi.advanceTimersByTime(TOAST_GAP_MS * 2));
    expect(result.current.toasts).toHaveLength(MAX_TOASTS);

    // Every bid gets its turn: wait long enough for all of them, counting each one seen.
    const seen = new Set(result.current.toasts.map((t) => t.id));
    for (let i = 0; i < 40; i++) {
      act(() => vi.advanceTimersByTime(500));
      for (const t of result.current.toasts) seen.add(t.id);
      expect(result.current.toasts.length).toBeLessThanOrEqual(MAX_TOASTS);
    }
    expect(seen.size).toBe(6);
    expect(result.current.toasts).toEqual([]);
  });

  it("keeps a lone toast up for the full time", () => {
    const { result } = renderHook(() => useDonationMoments(EVENT, () => {}));
    act(() => listener!(bid(1)));
    act(() => vi.advanceTimersByTime(TOAST_BUSY_MS + 100));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(result.current.toasts).toEqual([]);
  });
});
