import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { errorText, newId, useReplicant } from "@32dashboards/nodecg-react";
import {
  INFO_BAR_SEGMENTS,
  type ActiveEventIdReplicant,
  type BidWar,
  type EventsReplicant,
  type FundraiserEvent,
  type InfoBarSegmentKind,
} from "@32dashboards/schema/core";
import { formatAmount, validateTheme } from "@32dashboards/ui";
import "@32dashboards/nodecg-react/panel.css";
import { send } from "./send.js";

/*
 * Interim editor for an event's show content: what the info bar rotates
 * through and what gets celebrated. Each section edits a local draft and
 * saves it as one updateEvent; Phase 5 redesigns this for live operation.
 */

type Run = (promise: Promise<unknown>) => void;

const SEGMENT_LABELS: Record<InfoBarSegmentKind, string> = {
  items: "Item marquee",
  incentives: "Incentives",
  bidWars: "Bid wars",
  prizes: "Prizes",
  callToAction: "Call to action",
  announcements: "Announcements",
  sponsors: "Sponsors",
};

/** A local copy of `value` that resets whenever the saved value changes. */
function useDraft<T>(value: T): [T, (next: T) => void, boolean] {
  const saved = JSON.stringify(value);
  const [draft, setDraft] = useState<T>(value);
  useEffect(() => setDraft(JSON.parse(saved) as T), [saved]);
  return [draft, setDraft, JSON.stringify(draft) !== saved];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="section">
      <summary>{title}</summary>
      <div className="panel" style={{ padding: "8px 0 0" }}>
        {children}
      </div>
    </details>
  );
}

type FieldType = "text" | "number" | "optionalNumber" | "checkbox";
interface Field<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  width?: number;
}

/** Edits a list of rows with fixed fields; Save sends the whole list. */
function ListEditor<T extends { id: string }>(props: {
  items: T[];
  fields: Field<T>[];
  blank: () => T;
  addLabel: string;
  onSave: (items: T[]) => void;
}) {
  const [draft, setDraft, dirty] = useDraft(props.items);
  const update = (index: number, key: keyof T, value: unknown) =>
    setDraft(draft.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <>
      {draft.map((row, index) => (
        <div className="list-row" key={row.id}>
          {props.fields.map((field) => {
            const value = row[field.key] as unknown;
            if (field.type === "checkbox") {
              return (
                <label key={field.key}>
                  <input type="checkbox" checked={Boolean(value)} onChange={(e) => update(index, field.key, e.target.checked)} />{" "}
                  {field.label}
                </label>
              );
            }
            const numeric = field.type !== "text";
            return (
              <input
                key={field.key}
                aria-label={field.label}
                placeholder={field.label}
                style={{ width: field.width ?? (numeric ? 90 : 180) }}
                inputMode={numeric ? "decimal" : undefined}
                value={value === null || value === undefined ? "" : String(value)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!numeric) return update(index, field.key, raw);
                  if (raw.trim() === "") return update(index, field.key, field.type === "optionalNumber" ? null : 0);
                  const n = Number(raw);
                  if (Number.isFinite(n)) update(index, field.key, n);
                }}
              />
            );
          })}
          <button type="button" onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" onClick={() => setDraft([...draft, props.blank()])}>
          {props.addLabel}
        </button>
        <button type="button" disabled={!dirty} onClick={() => props.onSave(draft)}>
          Save
        </button>
        {dirty && <button type="button" onClick={() => setDraft(props.items)}>Discard</button>}
      </div>
    </>
  );
}

function BidWars({ event, run }: { event: FundraiserEvent; run: Run }) {
  const [draft, setDraft, dirty] = useDraft(event.bidWars);
  const savedTotals = new Map(event.bidWars.flatMap((w) => w.options.map((o) => [o.id, o.total] as const)));
  const updateWar = (index: number, patch: Partial<BidWar>) =>
    setDraft(draft.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const save = () => {
    // Totals may have been nudged since the draft was made; keep the live ones.
    const bidWars = draft.map((w) => ({
      ...w,
      options: w.options.map((o) => ({ ...o, total: savedTotals.get(o.id) ?? 0 })),
    }));
    run(send("updateEvent", { eventId: event.id, patch: { bidWars } }));
  };

  return (
    <>
      {draft.map((war, index) => (
        <div key={war.id} className="event">
          <div className="row">
            <input value={war.name} placeholder="Bid war name" onChange={(e) => updateWar(index, { name: e.target.value })} />
            <label>
              <input type="checkbox" checked={war.active} onChange={(e) => updateWar(index, { active: e.target.checked })} /> In
              rotation
            </label>
            <button type="button" onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
          {war.options.map((option, optionIndex) => {
            const saved = savedTotals.has(option.id);
            return (
              <div className="list-row" key={option.id}>
                <input
                  value={option.name}
                  placeholder="Option"
                  onChange={(e) =>
                    updateWar(index, {
                      options: war.options.map((o, i) => (i === optionIndex ? { ...o, name: e.target.value } : o)),
                    })
                  }
                />
                <strong className="num">{formatAmount(savedTotals.get(option.id) ?? 0)}</strong>
                {[-5, 5, 25, 100].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    disabled={!saved}
                    title={saved ? undefined : "Save first"}
                    onClick={() =>
                      run(send("nudgeBidWar", { eventId: event.id, bidWarId: war.id, optionId: option.id, delta }))
                    }
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => updateWar(index, { options: war.options.filter((_, i) => i !== optionIndex) })}
                >
                  Remove
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => updateWar(index, { options: [...war.options, { id: newId(), name: "", total: 0 }] })}
          >
            Add option
          </button>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          onClick={() => setDraft([...draft, { id: newId(), name: "", description: "", active: true, options: [] }])}
        >
          Add bid war
        </button>
        <button type="button" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </>
  );
}

function InfoBarEditor({ event, run }: { event: FundraiserEvent; run: Run }) {
  const [draft, setDraft, dirty] = useDraft(event.infoBar);
  const move = (index: number, by: number) => setDraft({ ...draft, segments: moveItem(draft.segments, index, by) });
  const missing = INFO_BAR_SEGMENTS.filter((kind) => !draft.segments.includes(kind));

  return (
    <>
      {draft.segments.map((kind, index) => (
        <div className="list-row" key={kind}>
          <span style={{ flex: 1 }}>{SEGMENT_LABELS[kind]}</span>
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
            ↑
          </button>
          <button type="button" disabled={index === draft.segments.length - 1} onClick={() => move(index, 1)}>
            ↓
          </button>
          <button type="button" onClick={() => setDraft({ ...draft, segments: draft.segments.filter((k) => k !== kind) })}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        {missing.map((kind) => (
          <button key={kind} type="button" onClick={() => setDraft({ ...draft, segments: [...draft.segments, kind] })}>
            + {SEGMENT_LABELS[kind]}
          </button>
        ))}
      </div>
      <label className="row">
        Seconds per segment
        <input
          inputMode="numeric"
          style={{ width: 60 }}
          value={draft.segmentSeconds}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n)) setDraft({ ...draft, segmentSeconds: n });
          }}
        />
      </label>
      <button type="button" disabled={!dirty} onClick={() => run(send("updateEvent", { eventId: event.id, patch: { infoBar: draft } }))}>
        Save
      </button>
    </>
  );
}

function CallToAction({ event, run }: { event: FundraiserEvent; run: Run }) {
  const [draft, setDraft, dirty] = useDraft(event.callToAction);
  return (
    <div className="row">
      <input
        style={{ flex: 1 }}
        maxLength={160}
        placeholder="e.g. Bid at 32auctions.com/spring-gala"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="button" disabled={!dirty} onClick={() => run(send("updateEvent", { eventId: event.id, patch: { callToAction: draft } }))}>
        Save
      </button>
    </div>
  );
}

interface Asset {
  base: string;
  name: string;
  url: string;
}

/** Files uploaded in the dashboard's Assets tab for one of this bundle's categories. */
function useAssets(category: "event-logos" | "sponsor-logos"): Asset[] {
  return useReplicant<Asset[]>(`assets:${category}`) ?? [];
}

function AssetSelect(props: { label: string; assets: Asset[]; value: string | null; onChange: (url: string | null) => void }) {
  const missing = props.value && !props.assets.some((a) => a.url === props.value);
  return (
    <select aria-label={props.label} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value || null)}>
      <option value="">No logo</option>
      {missing && <option value={props.value!}>{props.value} (not found)</option>}
      {props.assets.map((a) => (
        <option key={a.url} value={a.url}>
          {a.base}
        </option>
      ))}
    </select>
  );
}

const COLOR_FIELDS = [
  ["accentColor", "Accent (total, highlights)"],
  ["secondaryColor", "Secondary (headings, bars)"],
  ["backgroundFrom", "Background, top"],
  ["backgroundTo", "Background, bottom"],
] as const;

function LookAndSponsors({ event, run }: { event: FundraiserEvent; run: Run }) {
  const eventLogos = useAssets("event-logos");
  const sponsorLogos = useAssets("sponsor-logos");
  const [theme, setTheme, themeDirty] = useDraft(event.theme);
  const [sponsors, setSponsors, sponsorsDirty] = useDraft(event.sponsors);
  const issues = validateTheme(theme);

  return (
    <>
      <p className="muted">Upload logos in the dashboard's Assets tab, then pick them here.</p>
      <label className="field">
        <span>Event logo (top left of the TV)</span>
        <AssetSelect label="Event logo" assets={eventLogos} value={theme.logoUrl} onChange={(logoUrl) => setTheme({ ...theme, logoUrl })} />
      </label>
      {COLOR_FIELDS.map(([key, label]) => (
        <label key={key} className="row">
          <input type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} />
          {label}
        </label>
      ))}
      {issues.map((issue, i) => (
        <p key={i} className={issue.level === "error" ? "error" : "warning"}>
          {issue.message}
        </p>
      ))}
      {issues.length === 0 && <p className="muted">Colors meet contrast and broadcast-safe rules.</p>}
      <button type="button" className="primary" disabled={!themeDirty} onClick={() => run(send("updateEvent", { eventId: event.id, patch: { theme } }))}>
        Save look
      </button>

      <h4 style={{ margin: "8px 0 0" }}>Sponsors</h4>
      {sponsors.map((sponsor, index) => (
        <div className="list-row" key={sponsor.id}>
          <input
            aria-label="Sponsor name"
            placeholder="Sponsor name"
            value={sponsor.name}
            onChange={(e) => setSponsors(sponsors.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)))}
          />
          <AssetSelect
            label="Sponsor logo"
            assets={sponsorLogos}
            value={sponsor.logoUrl}
            onChange={(logoUrl) => setSponsors(sponsors.map((s, i) => (i === index ? { ...s, logoUrl } : s)))}
          />
          <button type="button" disabled={index === 0} onClick={() => setSponsors(moveItem(sponsors, index, -1))}>
            ↑
          </button>
          <button type="button" onClick={() => setSponsors(sponsors.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" onClick={() => setSponsors([...sponsors, { id: newId(), name: "", logoUrl: null, sortOrder: sponsors.length }])}>
          Add sponsor
        </button>
        <button
          type="button"
          className="primary"
          disabled={!sponsorsDirty}
          onClick={() =>
            run(send("updateEvent", { eventId: event.id, patch: { sponsors: sponsors.map((s, i) => ({ ...s, sortOrder: i })) } }))
          }
        >
          Save sponsors
        </button>
      </div>
    </>
  );
}

function moveItem<T>(list: T[], index: number, by: number): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item!);
  return next;
}

/** ISO timestamp <-> the value of an <input type="datetime-local"> (local time, minutes). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function EventDetails({ event, run }: { event: FundraiserEvent; run: Run }) {
  const saved = {
    name: event.name,
    causeName: event.causeName,
    endDateTime: toLocalInput(event.endDateTime),
    announcements: event.announcements.join("\n"),
    askMeTitle: event.askMe.title,
    askMeMessage: event.askMe.message,
  };
  const [draft, setDraft, dirty] = useDraft(saved);
  const field = (key: keyof typeof saved) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }),
  });

  const save = () =>
    run(
      send("updateEvent", {
        eventId: event.id,
        patch: {
          name: draft.name.trim(),
          causeName: draft.causeName.trim(),
          endDateTime: fromLocalInput(draft.endDateTime),
          announcements: draft.announcements.split("\n").map((a) => a.trim()).filter(Boolean),
          askMe: { title: draft.askMeTitle, message: draft.askMeMessage },
        },
      }),
    );

  return (
    <>
      <label className="field">
        <span>Event name (top of the TV)</span>
        <input maxLength={200} {...field("name")} />
      </label>
      <label className="field">
        <span>Raising money for</span>
        <input maxLength={200} placeholder="e.g. Riverside Animal Shelter" {...field("causeName")} />
      </label>
      <label className="field">
        <span>Bidding closes (the TV counts down to this)</span>
        <input type="datetime-local" {...field("endDateTime")} />
      </label>
      <label className="field">
        <span>Announcements, one per line</span>
        <textarea rows={4} {...field("announcements")} />
      </label>
      <label className="field">
        <span>Ask Me title</span>
        <input maxLength={120} {...field("askMeTitle")} />
      </label>
      <label className="field">
        <span>Ask Me message (Markdown: **bold**, - lists)</span>
        <textarea rows={5} maxLength={1200} {...field("askMeMessage")} />
      </label>
      <div className="row">
        <button type="button" className="primary" disabled={!dirty || !draft.name.trim()} onClick={save}>
          Save details
        </button>
        {dirty && <button type="button" onClick={() => setDraft(saved)}>Discard</button>}
      </div>
    </>
  );
}

function HiddenItems({ event, run }: { event: FundraiserEvent; run: Run }) {
  const [draft, setDraft, dirty] = useDraft(event.filters.join("\n"));
  return (
    <>
      <label className="field">
        <span>Hide items whose title contains (one per line, any case)</span>
        <textarea rows={4} placeholder="e.g. raffle" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button
        type="button"
        className="primary"
        disabled={!dirty}
        onClick={() => run(send("setFilters", { eventId: event.id, filters: draft.split("\n") }))}
      >
        Save hidden items
      </button>
    </>
  );
}

function ShowContent() {
  const events = useReplicant<EventsReplicant>("events");
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId") ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSelectedId(null), [activeId]);

  if (!events) return <p className="panel">Waiting for state…</p>;
  const event = events.find((e) => e.id === selectedId) ?? events.find((e) => e.id === activeId) ?? events[0];
  if (!event) return <p className="panel">No events yet. Create one in the Events panel.</p>;

  const run: Run = (promise) => {
    setError(null);
    promise.catch((err) => setError(errorText(err)));
  };
  const save = (patch: Parameters<typeof send<"updateEvent">>[1]["patch"]) => run(send("updateEvent", { eventId: event.id, patch }));

  return (
    <div className="panel">
      <label className="field">
        <span className="muted">Event</span>
        <select value={event.id} onChange={(e) => setSelectedId(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.id === activeId ? " (on screen)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* key: drafts reset when switching events */}
      <div key={event.id} className="panel" style={{ padding: 0 }}>
        <Section title="Event details">
          <EventDetails event={event} run={run} />
        </Section>
        <Section title={`Look and sponsors (${event.sponsors.length} sponsor${event.sponsors.length === 1 ? "" : "s"})`}>
          <LookAndSponsors event={event} run={run} />
        </Section>
        <Section title={`Hidden items (${event.filters.length})`}>
          <HiddenItems event={event} run={run} />
        </Section>
        <Section title="Call to action">
          <CallToAction event={event} run={run} />
        </Section>
        <Section title="Info bar rotation">
          <InfoBarEditor event={event} run={run} />
        </Section>
        <Section title={`Milestones (${event.milestones.length})`}>
          <ListEditor
            items={event.milestones}
            fields={[
              { key: "amount", label: "Amount", type: "number" },
              { key: "label", label: "Label (optional)", type: "text", width: 220 },
            ]}
            blank={() => ({ id: newId(), amount: 0, label: "" })}
            addLabel="Add milestone"
            onSave={(milestones) => save({ milestones })}
          />
        </Section>
        <Section title={`Incentives (${event.incentives.length})`}>
          <ListEditor
            items={event.incentives}
            fields={[
              { key: "name", label: "Name", type: "text" },
              { key: "target", label: "Target", type: "number" },
              { key: "active", label: "In rotation", type: "checkbox" },
              { key: "displayNow", label: "Pin now", type: "checkbox" },
              { key: "displayUntilMet", label: "Pin until met", type: "checkbox" },
            ]}
            blank={() => ({ id: newId(), name: "", target: 0, active: true, displayNow: false, displayUntilMet: false })}
            addLabel="Add incentive"
            onSave={(incentives) => save({ incentives })}
          />
        </Section>
        <Section title={`Bid wars (${event.bidWars.length})`}>
          <BidWars event={event} run={run} />
        </Section>
        <Section title={`Prizes (${event.prizes.length})`}>
          <ListEditor
            items={event.prizes}
            fields={[
              { key: "name", label: "Name", type: "text" },
              { key: "description", label: "Description", type: "text" },
              { key: "minimumDonation", label: "Min. $", type: "optionalNumber" },
              { key: "active", label: "In rotation", type: "checkbox" },
            ]}
            blank={() => ({ id: newId(), name: "", description: "", minimumDonation: null, active: true })}
            addLabel="Add prize"
            onSave={(prizes) => save({ prizes })}
          />
        </Section>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ShowContent />);
