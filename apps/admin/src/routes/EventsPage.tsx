import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/apiClient.js";

interface EventSummary {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  endDateTime: string | null;
}

const EMPTY_FORM = { slug: "", name: "", causeName: "", orgId: "", auctionId: "", friendlyAuctionPath: "" };

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      setEvents(await api.get<EventSummary[]>("/events"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post("/events", {
        slug: form.slug,
        name: form.name,
        causeName: form.causeName || undefined,
        scraperSource: {
          orgId: form.orgId,
          auctionId: form.auctionId,
          friendlyAuctionPath: form.friendlyAuctionPath,
        },
      });
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id: string) {
    setError(null);
    try {
      await api.post(`/events/${id}/activate`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <h1>Events</h1>
      {error && <p className="events-page__error">{error}</p>}
      <table className="events-page__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events?.map((event) => (
            <tr key={event.id}>
              <td>
                <Link to={`/events/${event.id}`}>{event.name}</Link>
              </td>
              <td>{event.slug}</td>
              <td>{event.isActive ? "Active" : ""}</td>
              <td>{!event.isActive && <button onClick={() => handleActivate(event.id)}>Activate</button>}</td>
            </tr>
          ))}
          {events?.length === 0 && (
            <tr>
              <td colSpan={4}>No events yet -- create one below.</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="admin-section">
        <h2>Create Event</h2>
        <form className="events-page__form" onSubmit={handleCreate}>
          <label>
            Slug
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </label>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Cause name
            <input value={form.causeName} onChange={(e) => setForm({ ...form, causeName: e.target.value })} />
          </label>
          <label>
            32auctions org ID
            <input value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })} required />
          </label>
          <label>
            32auctions auction ID
            <input value={form.auctionId} onChange={(e) => setForm({ ...form, auctionId: e.target.value })} required />
          </label>
          <label>
            Friendly auction path
            <input
              value={form.friendlyAuctionPath}
              onChange={(e) => setForm({ ...form, friendlyAuctionPath: e.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create Event"}
          </button>
        </form>
      </section>
    </div>
  );
}
