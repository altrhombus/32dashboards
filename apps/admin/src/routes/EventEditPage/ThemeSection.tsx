import { useState } from "react";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

export function ThemeSection({ eventId, event, onSaved }: SectionProps) {
  const [theme, setTheme] = useState(event.theme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof theme>(key: K, value: (typeof theme)[K]) {
    setTheme((t) => ({ ...t, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}`, { theme });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>Theme</h2>
      <div className="admin-row">
        <label>
          Accent
          <input type="color" value={theme.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
        </label>
        <label>
          Secondary
          <input type="color" value={theme.secondaryColor} onChange={(e) => set("secondaryColor", e.target.value)} />
        </label>
        <label>
          Background from
          <input type="color" value={theme.backgroundFrom} onChange={(e) => set("backgroundFrom", e.target.value)} />
        </label>
        <label>
          Background to
          <input type="color" value={theme.backgroundTo} onChange={(e) => set("backgroundTo", e.target.value)} />
        </label>
      </div>
      <label>
        Logo URL
        <input value={theme.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value || null)} />
      </label>
      <div className="admin-row">
        <label>
          Display font
          <input value={theme.fontDisplay} onChange={(e) => set("fontDisplay", e.target.value)} />
        </label>
        <label>
          Monospace font
          <input value={theme.fontMono} onChange={(e) => set("fontMono", e.target.value)} />
        </label>
      </div>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
