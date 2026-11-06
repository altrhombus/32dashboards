/// <reference types="nodecg/types/augment-window" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { infoBarMachine, selectInfoBarView } from "@32dashboards/incentive-machine";
import type { DonationMoment, LiveStateReplicant } from "@32dashboards/schema/core";
import type { CelebrationMoment, InfoBarDisplay, RoundWrapMoment, ToastMoment } from "./data.js";
import { buildSegments } from "./segments.js";

export const CELEBRATION_MS = 8_000;
export const TOAST_MS = 6_000;
/** A toast's time on screen while others wait, so a burst of bids drains. */
export const TOAST_BUSY_MS = 3_500;
export const MAX_TOASTS = 3;
/** Toasts arrive at least this far apart, so each one gets its moment. */
export const TOAST_GAP_MS = 1_000;
/** Toasts waiting beyond this are dropped, oldest first: a backlog would only show stale bids. */
export const MAX_WAITING_TOASTS = 12;
/** How long an Ask Me round's wrap-up stays on screen. */
export const ROUND_WRAP_MS = 7_000;

/**
 * Drives the info bar: feeds the current segments to the sequencer and
 * returns what it says to show. `celebrate` queues a milestone or met
 * incentive, which interrupts the rotation.
 */
export function useInfoBar(live: LiveStateReplicant | undefined) {
  const [snapshot, send] = useMachine(infoBarMachine, { input: {} });
  const celebrations = useRef(new Map<string, CelebrationMoment>());
  const plan = useMemo(() => (live ? buildSegments(live) : { segments: [], pinned: null }), [live]);

  // Only resend when the rotation itself changes, not on every total update.
  const signature = JSON.stringify([plan.segments.map((s) => [s.key, s.durationMs]), plan.pinned?.key]);
  useEffect(() => {
    send({
      type: "SEGMENTS_UPDATED",
      segments: plan.segments.map(({ key, durationMs }) => ({ key, durationMs })),
      pinned: plan.pinned && { key: plan.pinned.key, durationMs: plan.pinned.durationMs },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const celebrate = useCallback(
    (moment: CelebrationMoment) => {
      const key = `moment:${moment.id}`;
      celebrations.current.set(key, moment);
      send({ type: "CELEBRATE", celebration: { key, durationMs: CELEBRATION_MS } });
    },
    [send],
  );

  const view = selectInfoBarView(snapshot);
  let display: InfoBarDisplay = { type: "empty" };
  if (view.type === "celebration") {
    const moment = celebrations.current.get(view.key);
    if (moment) display = { type: "celebration", moment };
  } else if (view.type === "segment") {
    // Content comes from the latest plan, so a segment on screen shows live numbers.
    const segment = view.pinned ? plan.pinned : plan.segments.find((s) => s.key === view.key);
    if (segment) display = { type: "segment", segment };
  }
  return { display, celebrate };
}

/**
 * Listens for fundraiser-core's donation moments for `eventId`: milestones,
 * met incentives and the last calls before bidding closes go to `celebrate`;
 * new donations and bids become toasts, each its own, arriving one by one
 * (at most MAX_TOASTS on screen; the rest wait their turn, and toasts stay up
 * for less time while others wait); a finished Ask Me round becomes its
 * wrap-up (`roundWrap`) for ROUND_WRAP_MS.
 */
export function useDonationMoments(eventId: string | null, celebrate: (moment: CelebrationMoment) => void) {
  const [toasts, setToasts] = useState<ToastMoment[]>([]);
  const [roundWrap, setRoundWrap] = useState<RoundWrapMoment | null>(null);
  const eventRef = useRef(eventId);
  eventRef.current = eventId;
  const waiting = useRef<ToastMoment[]>([]);
  // A ref, so a new `celebrate` doesn't resubscribe and lose the toasts' timers.
  const celebrateRef = useRef(celebrate);
  celebrateRef.current = celebrate;

  useEffect(() => {
    setToasts([]);
    setRoundWrap(null);
    waiting.current = [];
  }, [eventId]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
    };
    let shown = 0;
    let lastShownAt = 0;
    let pumpQueued = false;

    // Moves the next waiting toast on screen when there's room, one at a time.
    const pump = () => {
      if (pumpQueued || waiting.current.length === 0 || shown >= MAX_TOASTS) return;
      const wait = lastShownAt + TOAST_GAP_MS - Date.now();
      if (wait > 0) {
        pumpQueued = true;
        later(wait, () => {
          pumpQueued = false;
          pump();
        });
        return;
      }
      const moment = waiting.current.shift()!;
      shown++;
      lastShownAt = Date.now();
      setToasts((current) => [...current, moment]);
      later(waiting.current.length > 0 ? TOAST_BUSY_MS : TOAST_MS, () => {
        shown--;
        setToasts((current) => current.filter((t) => t.id !== moment.id));
        pump();
      });
      pump();
    };

    const handler = (moment: DonationMoment) => {
      if (moment.eventId !== eventRef.current) return;
      if (moment.kind === "milestone" || moment.kind === "incentive-met" || moment.kind === "last-call") {
        celebrateRef.current(moment);
        return;
      }
      if (moment.kind === "askme-round") {
        setRoundWrap(moment);
        later(ROUND_WRAP_MS, () => setRoundWrap((current) => (current?.id === moment.id ? null : current)));
        return;
      }
      waiting.current = [...waiting.current, moment].slice(-MAX_WAITING_TOASTS);
      pump();
    };
    nodecg.listenFor("donationMoment", "fundraiser-core", handler);
    return () => {
      nodecg.unlisten("donationMoment", "fundraiser-core", handler);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return { toasts, roundWrap };
}
