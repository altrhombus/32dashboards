import { useState } from "react";
import { api, errorMessage } from "../../lib/apiClient.js";
import type { SectionProps } from "./BasicInfoSection.js";

export function ScraperSourceSection({ eventId, event, onSaved }: SectionProps) {
  const [source, setSource] = useState(event.scraperSource);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof source>(key: K, value: (typeof source)[K]) {
    setSource((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/events/${eventId}`, { scraperSource: source });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <h2>32auctions Source</h2>
      <div className="admin-row">
        <label>
          Org ID
          <input value={source.orgId} onChange={(e) => set("orgId", e.target.value)} />
        </label>
        <label>
          Auction ID
          <input value={source.auctionId} onChange={(e) => set("auctionId", e.target.value)} />
        </label>
        <label>
          Friendly path
          <input value={source.friendlyAuctionPath} onChange={(e) => set("friendlyAuctionPath", e.target.value)} />
        </label>
      </div>
      <div className="admin-row">
        <label>
          Session cookie
          <input
            type="password"
            value={source.sessionCookie ?? ""}
            onChange={(e) => set("sessionCookie", e.target.value || null)}
          />
        </label>
        <label>
          Auth token
          <input
            type="password"
            value={source.authToken ?? ""}
            onChange={(e) => set("authToken", e.target.value || null)}
          />
        </label>
        <label>
          Refresh interval (s)
          <input
            type="number"
            min={1}
            value={source.refreshIntervalSeconds}
            onChange={(e) => set("refreshIntervalSeconds", Number(e.target.value))}
          />
        </label>
      </div>
      {error && <p className="admin-section__error">{error}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
