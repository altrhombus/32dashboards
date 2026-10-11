import { assign, setup, type SnapshotFrom } from "xstate";

/*
 * Sequences the info bar: rotates through segments, holds a pinned segment
 * while it's pinned, and interrupts either for queued celebrations, which
 * play one at a time. It knows nothing about what a segment shows; layouts
 * build the segment list (one per incentive, bid war, prize, …) and render
 * whatever the machine selects.
 */

export interface InfoBarSegment {
  /** Stable across updates, e.g. "bidWar:<id>", so rotation keeps its place when data changes. */
  key: string;
  durationMs: number;
}

export interface InfoBarCelebration {
  key: string;
  durationMs: number;
}

export interface InfoBarContext {
  segments: InfoBarSegment[];
  index: number;
  pinned: InfoBarSegment | null;
  queue: InfoBarCelebration[];
}

export type InfoBarEvent =
  | { type: "SEGMENTS_UPDATED"; segments: InfoBarSegment[]; pinned?: InfoBarSegment | null }
  | { type: "CELEBRATE"; celebration: InfoBarCelebration };

const DEFAULT_SEGMENT_MS = 10_000;

/** Where `key` sits in `segments` now, or the next position if it's gone. */
function reindex(previous: InfoBarContext, segments: InfoBarSegment[]): number {
  if (segments.length === 0) return 0;
  const currentKey = previous.segments[previous.index]?.key;
  const found = segments.findIndex((s) => s.key === currentKey);
  return found >= 0 ? found : previous.index % segments.length;
}

export const infoBarMachine = setup({
  types: {
    context: {} as InfoBarContext,
    events: {} as InfoBarEvent,
    input: {} as { segments?: InfoBarSegment[]; pinned?: InfoBarSegment | null },
  },
  actions: {
    ingest: assign(({ context, event }) => {
      if (event.type !== "SEGMENTS_UPDATED") return {};
      return { segments: event.segments, index: reindex(context, event.segments), pinned: event.pinned ?? null };
    }),
    enqueue: assign(({ context, event }) => {
      if (event.type !== "CELEBRATE") return {};
      return { queue: [...context.queue, event.celebration] };
    }),
    advance: assign(({ context }) => ({
      index: context.segments.length ? (context.index + 1) % context.segments.length : 0,
    })),
    dequeue: assign(({ context }) => ({ queue: context.queue.slice(1) })),
  },
  guards: {
    hasCelebration: ({ context }) => context.queue.length > 0,
    hasPinned: ({ context }) => context.pinned !== null,
    hasSegments: ({ context }) => context.segments.length > 0,
    /** Whether an update changes what should be on screen, beyond the rotation's contents. */
    pinChanged: ({ context, event }) =>
      event.type === "SEGMENTS_UPDATED" && (event.pinned?.key ?? null) !== (context.pinned?.key ?? null),
    segmentsEmptied: ({ event }) => event.type === "SEGMENTS_UPDATED" && event.segments.length === 0,
  },
  delays: {
    segment: ({ context }) => context.segments[context.index]?.durationMs ?? DEFAULT_SEGMENT_MS,
    celebration: ({ context }) => context.queue[0]?.durationMs ?? 0,
  },
}).createMachine({
  id: "infoBar",
  context: ({ input }) => ({
    segments: input?.segments ?? [],
    index: 0,
    pinned: input?.pinned ?? null,
    queue: [],
  }),
  initial: "resolving",
  states: {
    // Transient: picks what to show, in priority order.
    resolving: {
      always: [
        { guard: "hasCelebration", target: "celebrating" },
        { guard: "hasPinned", target: "pinned" },
        { guard: "hasSegments", target: "rotating" },
        { target: "empty" },
      ],
    },
    empty: {
      on: {
        SEGMENTS_UPDATED: { target: "resolving", actions: "ingest" },
        CELEBRATE: { target: "celebrating", actions: "enqueue" },
      },
    },
    rotating: {
      initial: "showing",
      states: {
        showing: {
          after: { segment: { target: "showing", actions: "advance", reenter: true } },
        },
      },
      on: {
        // Data changes update the rotation in place without restarting the current segment's timer.
        SEGMENTS_UPDATED: [
          { guard: "pinChanged", target: "resolving", actions: "ingest" },
          { guard: "segmentsEmptied", target: "resolving", actions: "ingest" },
          { actions: "ingest" },
        ],
        CELEBRATE: { target: "celebrating", actions: "enqueue" },
      },
    },
    pinned: {
      on: {
        SEGMENTS_UPDATED: [{ guard: "pinChanged", target: "resolving", actions: "ingest" }, { actions: "ingest" }],
        CELEBRATE: { target: "celebrating", actions: "enqueue" },
      },
    },
    celebrating: {
      after: { celebration: { target: "resolving", actions: "dequeue" } },
      on: {
        SEGMENTS_UPDATED: { actions: "ingest" },
        // Only queues, so the celebration on screen isn't cut short.
        CELEBRATE: { actions: "enqueue" },
      },
    },
  },
});

export type InfoBarSnapshot = SnapshotFrom<typeof infoBarMachine>;

export type InfoBarView =
  | { type: "celebration"; key: string }
  | { type: "segment"; key: string; pinned: boolean }
  | { type: "empty" };

/** What the info bar should show for a snapshot. */
export function selectInfoBarView(snapshot: InfoBarSnapshot): InfoBarView {
  const { context } = snapshot;
  if (snapshot.matches("celebrating") && context.queue[0]) return { type: "celebration", key: context.queue[0].key };
  if (snapshot.matches("pinned") && context.pinned) return { type: "segment", key: context.pinned.key, pinned: true };
  const segment = context.segments[context.index];
  if (snapshot.matches("rotating") && segment) return { type: "segment", key: segment.key, pinned: false };
  return { type: "empty" };
}
