import { useState } from "react";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

export function AskMeSection({ eventId, event, onSaved }: SectionProps) {
  const [askMe, setAskMe] = useState(event.askMe);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof askMe>(key: K, value: (typeof askMe)[K]) {
    setAskMe((a) => ({ ...a, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}/askme`, askMe);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>Ask Me Mode</h2>
      <label>
        <input type="checkbox" checked={askMe.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled
        (full-takeover on the public display)
      </label>
      <label>
        Title
        <input value={askMe.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
      </label>
      <label>
        Message (Markdown)
        <textarea
          value={askMe.message}
          onChange={(e) => set("message", e.target.value)}
          maxLength={1200}
          rows={4}
        />
      </label>
      <label>
        Total
        <input type="number" min={0} value={askMe.total} onChange={(e) => set("total", Number(e.target.value))} />
      </label>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
