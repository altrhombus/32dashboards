import { useEffect, useState } from "react";
import type {
  ActiveEventIdReplicant,
  EventsReplicant,
  FundraiserEvent,
  RegisteredSourcesReplicant,
  SourceLogReplicant,
} from "@32dashboards/schema/core";
import { useReplicant } from "./useReplicant.js";

/*
 * Building blocks for source-adapter panels: picking which event to
 * configure, and showing what the adapter is doing.
 */

const CORE = "fundraiser-core";

/**
 * The events that use `sourceId`, and which of them the panel is editing.
 * Defaults to the active event when it uses this source.
 */
export function useSourceEvents(sourceId: string) {
  const events = useReplicant<EventsReplicant>("events", CORE);
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId", CORE) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mine = (events ?? []).filter((e) => e.source.adapterId === sourceId);
  const fallback = mine.find((e) => e.id === activeId) ?? mine[0] ?? null;
  const selected = mine.find((e) => e.id === selectedId) ?? fallback;

  // Follow the active event when it changes, unless the operator picked another.
  useEffect(() => setSelectedId(null), [activeId]);

  return { loaded: events !== undefined, events: mine, selected, activeId, select: setSelectedId };
}

export function EventPicker(props: {
  events: FundraiserEvent[];
  selected: FundraiserEvent | null;
  activeId: string | null;
  onSelect: (eventId: string) => void;
  sourceLabel: string;
}) {
  const { events, selected, activeId, onSelect, sourceLabel } = props;
  if (events.length === 0) {
    return (
      <p className="muted">
        No event uses {sourceLabel} yet. Pick it as an event's source in the Events panel on the Event tab.
      </p>
    );
  }
  return (
    <label className="field">
      <span className="muted">Event</span>
      <select value={selected?.id ?? ""} onChange={(e) => onSelect(e.target.value)}>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
            {event.id === activeId ? " (on screen)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One line: the adapter's state, message, and when it last delivered data. */
/** What each source state means, in plain words. */
const STATE_WORDS: Record<string, string> = {
  idle: "Not in use right now",
  working: "Fetching…",
  ok: "Connected",
  error: "Needs a look",
};

export function SourceStatusLine({ sourceId }: { sourceId: string }) {
  const sources = useReplicant<RegisteredSourcesReplicant>("sources", CORE);
  const source = sources?.find((s) => s.id === sourceId);
  if (!sources) return null;
  if (!source) {
    return (
      <p className="status-error">
        This source isn't running. In WSL, run <code>sudo systemctl restart 32dashboards-nodecg</code>.
      </p>
    );
  }
  const { state, message } = source.status;
  return (
    <div className={`source-status status-${state}`} role="status">
      <strong>{STATE_WORDS[state] ?? state}</strong>
      {message && <span>{message}</span>}
      {source.lastResultAt && (
        <span className="muted">
          Last data at {new Date(source.lastResultAt).toLocaleTimeString([], { timeStyle: "short" })}
        </span>
      )}
    </div>
  );
}

/** Recent log lines from one adapter, newest first. */
export function SourceLog({ sourceId, limit = 30 }: { sourceId: string; limit?: number }) {
  const log = useReplicant<SourceLogReplicant>("sourceLog", CORE) ?? [];
  const lines = log
    .filter((l) => l.sourceId === sourceId)
    .slice(-limit)
    .reverse();
  if (lines.length === 0) return <p className="muted">No log entries yet.</p>;
  return (
    <pre className="log">
      {lines.map((l) => `${new Date(l.at).toLocaleTimeString()} ${l.level.toUpperCase()} ${l.message}`).join("\n")}
    </pre>
  );
}
