import { useState } from "react";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

export function AnnouncementsSection({ eventId, event, onSaved }: SectionProps) {
  const [announcements, setAnnouncements] = useState(event.announcements);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addDraft() {
    if (!draft.trim()) return;
    setAnnouncements((list) => [...list, draft.trim()]);
    setDraft("");
  }

  function remove(index: number) {
    setAnnouncements((list) => list.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}/announcements`, { announcements });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>Announcements</h2>
      {announcements.map((announcement, i) => (
        <div className="admin-row" key={i}>
          <span>{announcement}</span>
          <button className="secondary" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <div className="admin-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="New announcement"
          onKeyDown={(e) => e.key === "Enter" && addDraft()}
        />
        <button className="secondary" onClick={addDraft}>
          Add
        </button>
      </div>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
