import { useState } from "react";
import type { EventConfig } from "@32dashboards/schema";
import { api, errorMessage } from "../../lib/apiClient.js";

export interface SectionProps {
  eventId: string;
  event: EventConfig;
  onSaved: () => void;
}

export function BasicInfoSection({ eventId, event, onSaved }: SectionProps) {
  const [name, setName] = useState(event.name);
  const [causeName, setCauseName] = useState(event.causeName);
  const [endDateTime, setEndDateTime] = useState(event.endDateTime ? event.endDateTime.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}`, {
        name,
        causeName,
        endDateTime: endDateTime ? new Date(endDateTime).toISOString() : null,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>Basic Info</h2>
      <label>
        Auction name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>
      <label>
        Cause name
        <input value={causeName} onChange={(e) => setCauseName(e.target.value)} maxLength={200} />
      </label>
      <label>
        End date/time
        <input type="datetime-local" value={endDateTime} onChange={(e) => setEndDateTime(e.target.value)} />
      </label>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
