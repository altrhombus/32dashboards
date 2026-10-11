import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useReplicant } from "@32dashboards/nodecg-react";
import type {
  ActiveEventIdReplicant,
  EventsReplicant,
  FundraiserEvent,
  RegisteredSourcesReplicant,
} from "@32dashboards/schema/core";
import { errorText, send } from "./send.js";
import "./panel.css";

function Events() {
  const events = useReplicant<EventsReplicant>("events");
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId");
  const sources = useReplicant<RegisteredSourcesReplicant>("sources") ?? [];
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!events) return <p className="panel">Waiting for state…</p>;

  const run = (promise: Promise<unknown>) => {
    setError(null);
    promise.catch((err) => setError(errorText(err)));
  };

  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="panel">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(send("createEvent", { name: name.trim() }));
          setName("");
        }}
      >
        <input placeholder="New event name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()}>
          Create
        </button>
      </form>

      {activeId && (
        <button type="button" onClick={() => run(send("activateEvent", { eventId: null }))}>
          Take event off screen
        </button>
      )}

      {sorted.length === 0 && <p className="muted">No events yet.</p>}
      {sorted.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          active={event.id === activeId}
          sourceIds={sources.map((s) => s.id)}
          run={run}
        />
      ))}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function EventRow(props: {
  event: FundraiserEvent;
  active: boolean;
  sourceIds: string[];
  run: (promise: Promise<unknown>) => void;
}) {
  const { event, active, run } = props;
  const adapterId = event.source.adapterId;
  // Keep a configured adapter selectable even if it hasn't registered this run.
  const options = adapterId && !props.sourceIds.includes(adapterId) ? [...props.sourceIds, adapterId] : props.sourceIds;

  return (
    <div className="event">
      <div className="row">
        <strong>{event.name}</strong>
        {active && <span className="badge">On screen</span>}
      </div>
      <label className="row">
        <span className="muted">Source</span>
        <select
          value={adapterId ?? ""}
          onChange={(e) =>
            run(send("updateEvent", { eventId: event.id, patch: { source: { adapterId: e.target.value || null } } }))
          }
        >
          <option value="">None</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button type="button" disabled={active} onClick={() => run(send("activateEvent", { eventId: event.id }))}>
          Put on screen
        </button>
        <button type="button" onClick={() => run(send("duplicateEvent", { eventId: event.id }))}>
          Duplicate
        </button>
        <button
          type="button"
          disabled={active}
          onClick={() => {
            if (window.confirm(`Delete "${event.name}"? This can't be undone.`)) {
              run(send("deleteEvent", { eventId: event.id }));
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Events />);
