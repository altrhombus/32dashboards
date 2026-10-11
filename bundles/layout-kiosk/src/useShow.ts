/// <reference types="nodecg/types/augment-window" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { infoBarMachine, selectInfoBarView } from "@32dashboards/incentive-machine";
import type { DonationMoment, LiveStateReplicant } from "@32dashboards/schema/core";
import type { CelebrationMoment, InfoBarDisplay, ToastMoment } from "./data.js";
import { buildSegments } from "./segments.js";

export const CELEBRATION_MS = 8_000;
export const TOAST_MS = 6_000;
export const MAX_TOASTS = 3;

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
 * Listens for fundraiser-core's donation moments for `eventId`: milestones
 * and met incentives go to `celebrate`; new donations and bids become
 * toasts, a few at a time, each for a few seconds.
 */
export function useDonationMoments(eventId: string | null, celebrate: (moment: CelebrationMoment) => void) {
  const [toasts, setToasts] = useState<ToastMoment[]>([]);
  const eventRef = useRef(eventId);
  eventRef.current = eventId;

  useEffect(() => setToasts([]), [eventId]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const handler = (moment: DonationMoment) => {
      if (moment.eventId !== eventRef.current) return;
      if (moment.kind === "milestone" || moment.kind === "incentive-met") {
        celebrate(moment);
        return;
      }
      setToasts((current) => [...current, moment].slice(-MAX_TOASTS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((t) => t.id !== moment.id));
      }, TOAST_MS);
      timers.add(timer);
    };
    nodecg.listenFor("donationMoment", "fundraiser-core", handler);
    return () => {
      nodecg.unlisten("donationMoment", "fundraiser-core", handler);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [celebrate]);

  return toasts;
}
