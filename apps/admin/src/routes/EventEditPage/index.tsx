import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { EventConfig } from "@32dashboards/schema";
import { api, errorMessage } from "../../lib/apiClient.js";
import { BasicInfoSection } from "./BasicInfoSection.js";
import { ThemeSection } from "./ThemeSection.js";
import { ScraperSourceSection } from "./ScraperSourceSection.js";
import { AnnouncementsSection } from "./AnnouncementsSection.js";
import { AskMeSection } from "./AskMeSection.js";
import { IncentivesSection } from "./IncentivesSection.js";
import { SponsorsSection } from "./SponsorsSection.js";

export function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setEvent(await api.get<EventConfig>(`/events/${id}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) return <p className="event-edit-page__error">{error}</p>;
  if (!event || !id) return <p className="admin-loading">Loading…</p>;

  return (
    <div>
      <p>
        <Link to="/events">&larr; All events</Link>
      </p>
      <h1>{event.name}</h1>
      {event.isActive && <span className="event-edit-page__active-badge">Active</span>}

      <BasicInfoSection eventId={id} event={event} onSaved={refresh} />
      <ThemeSection eventId={id} event={event} onSaved={refresh} />
      <ScraperSourceSection eventId={id} event={event} onSaved={refresh} />
      <AnnouncementsSection eventId={id} event={event} onSaved={refresh} />
      <AskMeSection eventId={id} event={event} onSaved={refresh} />
      <IncentivesSection eventId={id} event={event} onSaved={refresh} />
      <SponsorsSection eventId={id} event={event} onSaved={refresh} />
    </div>
  );
}
