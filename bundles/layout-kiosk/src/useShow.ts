/// <reference types="nodecg/types/augment-window" />
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMachine } from "@xstate/react";
import { infoBarMachine, selectInfoBarView } from "@32dashboards/incentive-machine";
import type { DonationMoment, LiveStateReplicant } from "@32dashboards/schema/core";
import type { CelebrationMoment, InfoBarDisplay, RoundWrapMoment, ToastMoment } from "./data.js";
import { buildSegments } from "./segments.js";

export const CELEBRATION_MS = 8_000;
/** Celebrations remembered for the info bar to show: far more than can queue up at once. */
const MAX_CELEBRATIONS_KEPT = 20;
export const TOAST_MS = 6_000;
/** A toast's time on screen while others wait, so a burst of bids drains. */
export const TOAST_BUSY_MS = 3_500;
export const MAX_TOASTS = 3;
/** Toasts arrive at least this far apart, so each one gets its moment. */
export const TOAST_GAP_MS = 1_000;
/** Toasts waiting beyond this are dropped, oldest first: a backlog would only show stale bids. */
export const MAX_WAITING_TOASTS = 12;
/** How many of the latest bids and donations are kept for the info bar (more than fit). */
export const MAX_RECENT = 12;

/** `newer` first, then `older`, without repeats, at most MAX_RECENT. */
function mergeRecent(newer: ToastMoment[], older: ToastMoment[]): ToastMoment[] {
  const seen = new Set<string>();
  return [...newer, ...older].filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, MAX_RECENT);
}
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
      // Only the queued and showing ones are ever looked up; forget the rest, so a long night doesn't add up.
      for (const old of celebrations.current.keys()) {
        if (celebrations.current.size <= MAX_CELEBRATIONS_KEPT) break;
        celebrations.current.delete(old);
      }
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
export function useDonationMoments(
  eventId: string | null,
  celebrate: (moment: CelebrationMoment) => void,
  options: {
    /** Earlier moments (the core's `moments` Replicant), to start the latest-bids list from. */
    history?: DonationMoment[];
    /** True while the info bar shows the latest bids: no toasts then, since the bar shows each one. */
    quiet?: RefObject<boolean>;
  } = {},
) {
  const [toasts, setToasts] = useState<ToastMoment[]>([]);
  const [recent, setRecent] = useState<ToastMoment[]>([]);
  // Held in a ref so the listener below always sees the current one without resubscribing.
  const quietRef = useRef(options.quiet);
  quietRef.current = options.quiet;
  const seededFor = useRef<string | null>(null);
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
    setRecent([]);
    seededFor.current = null;
  }, [eventId]);

  // The latest-bids list starts from what already happened, once per event.
  const history = options.history;
  useEffect(() => {
    if (!eventId || !history || seededFor.current === eventId) return;
    seededFor.current = eventId;
    const earlier = history
      .filter((m): m is ToastMoment => m.eventId === eventId && (m.kind === "new-bid" || m.kind === "total-increase"))
      .reverse()
      .slice(0, MAX_RECENT);
    setRecent((current) => mergeRecent(current, earlier));
  }, [eventId, history]);

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
      // While the info bar lists the latest bids, toasts would repeat it: let them go.
      if (quietRef.current?.current) waiting.current = [];
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
      // "How long ago" goes by this screen's clock for what arrives live, so a TV computer whose
      // clock is a little off still says "just now" for a bid that just came in.
      setRecent((current) => mergeRecent([{ ...moment, at: new Date().toISOString() }], current));
      waiting.current = [...waiting.current, moment].slice(-MAX_WAITING_TOASTS);
      pump();
    };
    nodecg.listenFor("donationMoment", "fundraiser-core", handler);
    return () => {
      nodecg.unlisten("donationMoment", "fundraiser-core", handler);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return { toasts, roundWrap, recent };
}
