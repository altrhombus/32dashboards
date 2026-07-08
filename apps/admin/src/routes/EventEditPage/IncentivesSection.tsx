import { useState } from "react";
import type { Incentive } from "@32dashboards/schema";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

interface RowProps {
  eventId: string;
  incentive: Incentive;
  onSaved: () => void;
}

function IncentiveRow({ eventId, incentive, onSaved }: RowProps) {
  const [name, setName] = useState(incentive.name);
  const [target, setTarget] = useState(incentive.target);
  const [active, setActive] = useState(incentive.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="incentive-row">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        <input type="number" min={0} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => run(() => api.put(`/events/${eventId}/incentives/${incentive.id}`, { name, target, active }))}
        >
          Save
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(() =>
              api.post(`/events/${eventId}/incentives/${incentive.id}/state`, { displayNow: !incentive.displayNow })
            )
          }
        >
          {incentive.displayNow ? "Unpin (Display Now)" : "Display Now"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(() =>
              api.post(`/events/${eventId}/incentives/${incentive.id}/state`, {
                displayUntilMet: !incentive.displayUntilMet,
              })
            )
          }
        >
          {incentive.displayUntilMet ? "Unset Until Met" : "Display Until Met"}
        </button>
      </div>
      <div className="admin-row">
        <button
          className="danger"
          disabled={busy}
          onClick={() => run(() => api.delete(`/events/${eventId}/incentives/${incentive.id}`))}
        >
          Delete
        </button>
        {error && <p className="admin-section__error">{error}</p>}
      </div>
    </div>
  );
}

export function IncentivesSection({ eventId, event, onSaved }: SectionProps) {
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post(`/events/${eventId}/incentives`, { name: newName.trim(), target: newTarget });
      setNewName("");
      setNewTarget(0);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>Incentives</h2>
      {event.incentives.map((incentive) => (
        <IncentiveRow key={incentive.id} eventId={eventId} incentive={incentive} onSaved={onSaved} />
      ))}
      <div className="admin-row">
        <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} />
        <input
          type="number"
          min={0}
          placeholder="Target"
          value={newTarget}
          onChange={(e) => setNewTarget(Number(e.target.value))}
        />
        <button onClick={handleCreate} disabled={creating}>
          {creating ? "Adding…" : "Add Incentive"}
        </button>
      </div>
      {error && <p className="admin-section__error">{error}</p>}
    </section>
  );
}
