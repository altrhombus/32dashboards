import { useState } from "react";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

interface EditableSponsor {
  name: string;
  logoUrl: string;
  sortOrder: number;
}

function toEditable(sponsors: SectionProps["event"]["sponsors"]): EditableSponsor[] {
  return sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl ?? "", sortOrder: s.sortOrder }));
}

export function SponsorsSection({ eventId, event, onSaved }: SectionProps) {
  const [sponsors, setSponsors] = useState<EditableSponsor[]>(() => toEditable(event.sponsors));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<EditableSponsor>) {
    setSponsors((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function remove(index: number) {
    setSponsors((list) => list.filter((_, i) => i !== index));
  }

  function add() {
    setSponsors((list) => [...list, { name: "", logoUrl: "", sortOrder: list.length }]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}/sponsors`, {
        sponsors: sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl || null, sortOrder: s.sortOrder })),
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
      <h2>Sponsors</h2>
      {sponsors.map((sponsor, i) => (
        <div className="sponsor-row" key={i}>
          <input placeholder="Name" value={sponsor.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input
            placeholder="Logo URL"
            value={sponsor.logoUrl}
            onChange={(e) => update(i, { logoUrl: e.target.value })}
          />
          <input
            type="number"
            value={sponsor.sortOrder}
            onChange={(e) => update(i, { sortOrder: Number(e.target.value) })}
          />
          <button className="secondary" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button className="secondary" onClick={add}>
        Add Sponsor
      </button>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
