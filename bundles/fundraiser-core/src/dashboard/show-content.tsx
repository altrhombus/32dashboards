import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { errorText, newId, uploadAsset, useReplicant } from "@32dashboards/nodecg-react";
import {
  INFO_BAR_SEGMENTS,
  SPONSORS_TITLE,
  segmentSecondsFor,
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
  sponsors: "Logos",
};

/** A local copy of `value` that resets whenever the saved value changes. */
function useDraft<T>(value: T): [T, (next: T) => void, boolean] {
  const saved = JSON.stringify(value);
  const [draft, setDraft] = useState<T>(value);
  useEffect(() => setDraft(JSON.parse(saved) as T), [saved]);
  return [draft, setDraft, JSON.stringify(draft) !== saved];
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="section">
      <summary>{title}</summary>
      <div className="panel" style={{ padding: "8px 0 0" }}>
        {hint && (
          <p className="muted" style={{ margin: 0 }}>
            {hint}
          </p>
        )}
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
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => update(index, field.key, e.target.checked)}
                  />{" "}
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
        {dirty && (
          <button type="button" onClick={() => setDraft(props.items)}>
            Discard
          </button>
        )}
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
            <input
              value={war.name}
              placeholder="Bid war name"
              onChange={(e) => updateWar(index, { name: e.target.value })}
            />
            <label>
              <input
                type="checkbox"
                checked={war.active}
                onChange={(e) => updateWar(index, { active: e.target.checked })}
              />{" "}
              In rotation
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

/** How many segments of each kind the event has right now (the item marquee counts as one). */
function segmentCounts(event: FundraiserEvent): Record<InfoBarSegmentKind, number> {
  return {
    items: 1,
    incentives: event.incentives.filter((i) => i.active).length,
    bidWars: event.bidWars.filter((w) => w.active && w.options.length >= 2).length,
    prizes: event.prizes.filter((p) => p.active).length,
    callToAction: event.callToAction.trim() ? 1 : 0,
    announcements: event.announcements.filter((a) => a.trim()).length,
    sponsors: event.sponsors.length,
  };
}

function InfoBarEditor({ event, run }: { event: FundraiserEvent; run: Run }) {
  const [draft, setDraft, dirty] = useDraft(event.infoBar);
  const move = (index: number, by: number) => setDraft({ ...draft, segments: moveItem(draft.segments, index, by) });
  const missing = INFO_BAR_SEGMENTS.filter((kind) => !draft.segments.includes(kind));
  const counts = segmentCounts(event);
  const turn = draft.segments.reduce((sum, kind) => sum + counts[kind] * segmentSecondsFor(draft, kind), 0);
  const marquee = draft.segments.includes("items") ? segmentSecondsFor(draft, "items") : 0;
  const setSeconds = (kind: InfoBarSegmentKind, text: string) => {
    const seconds = { ...draft.seconds };
    const n = Number(text);
    if (text.trim() === "") delete seconds[kind];
    else if (Number.isInteger(n) && n > 0) seconds[kind] = Math.min(300, n);
    else return;
    setDraft({ ...draft, seconds });
  };

  return (
    <>
      {draft.segments.map((kind, index) => (
        <div className="list-row" key={kind}>
          <span style={{ flex: 1 }}>
            {SEGMENT_LABELS[kind]}
            {counts[kind] > 1 && <span className="muted"> ({counts[kind]}, each)</span>}
          </span>
          <input
            inputMode="numeric"
            style={{ width: 64 }}
            aria-label={`Seconds for ${SEGMENT_LABELS[kind]}`}
            placeholder={String(kind === "items" ? draft.segmentSeconds * 2 : draft.segmentSeconds)}
            value={draft.seconds[kind] ?? ""}
            onChange={(e) => setSeconds(kind, e.target.value)}
          />
          <span className="muted">s</span>
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
            ↑
          </button>
          <button type="button" disabled={index === draft.segments.length - 1} onClick={() => move(index, 1)}>
            ↓
          </button>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, segments: draft.segments.filter((k) => k !== kind) })}
          >
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
        Seconds for the rest
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
      <p className="muted" style={{ margin: 0 }}>
        Blank rows use that (the item marquee gets twice as long). One full turn takes about {turn} seconds
        {marquee > 0 && turn > 0 && `; the item marquee is ${Math.round((marquee / turn) * 100)}% of it`}. The marquee
        picks up where it left off each time.
      </p>
      <button
        type="button"
        disabled={!dirty}
        onClick={() => run(send("updateEvent", { eventId: event.id, patch: { infoBar: draft } }))}
      >
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
      <button
        type="button"
        disabled={!dirty}
        onClick={() => run(send("updateEvent", { eventId: event.id, patch: { callToAction: draft } }))}
      >
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

function AssetSelect(props: {
  label: string;
  assets: Asset[];
  value: string | null;
  onChange: (url: string | null) => void;
}) {
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
  ["accentColor", "Accent"],
  ["secondaryColor", "Secondary"],
  ["backgroundFrom", "Background, top"],
  ["backgroundTo", "Background, bottom"],
] as const;

/**
 * Opens the event's look in the Layouts tab (layout-kiosk's builder), which
 * edits it beside a live preview. The storage keys are that panel's.
 */
function editLook(eventId: string) {
  try {
    localStorage.setItem("32dashboards.builder.mode", "look");
    localStorage.setItem("32dashboards.builder.lookEvent", eventId);
  } catch {
    // Without storage the Layouts tab opens on its last view.
  }
  window.top!.location.hash = "fullbleed/builder";
}

function LookAndLogos({ event, run }: { event: FundraiserEvent; run: Run }) {
  const theme = event.theme;
  const issues = validateTheme(theme);
  const logoName = theme.logoUrl ? decodeURIComponent(theme.logoUrl.split("/").pop() ?? "") : null;

  return (
    <>
      <div className="row" aria-label="Colors">
        {COLOR_FIELDS.map(([key, label]) => (
          <span key={key} title={`${label}: ${theme[key]}`} className="swatch" style={{ background: theme[key] }} />
        ))}
        <span className="muted">
          {logoName ? `Logo: ${logoName}` : "No logo"}. Words in {theme.fontDisplay}, numbers in {theme.fontMono}.
        </span>
      </div>
      {issues.length > 0 && (
        <p className="warning">
          {issues.length === 1 ? "1 color needs a look." : `${issues.length} colors need a look.`}
        </p>
      )}
      <button type="button" className="primary" onClick={() => editLook(event.id)}>
        Edit the look
      </button>
      <p className="muted">Colors, logo and fonts are edited in the Layouts tab, next to a live preview.</p>

      <h4 style={{ margin: "8px 0 0" }}>Logos on the TV</h4>
      <Logos event={event} run={run} />
    </>
  );
}

/** Headings people commonly use over the logos. */
const LOGO_HEADINGS = [SPONSORS_TITLE, "Who we're helping", "Thank you to our supporters", "Our partners"];

/** "riverside-animal_shelter.png" -> "Riverside animal shelter" */
function nameFromFile(file: string): string {
  const base = file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base[0]!.toUpperCase() + base.slice(1) : "Logo";
}

/**
 * The logos the TVs rotate through (sponsors, or the causes the event
 * helps), with the heading over them. Uploading adds a logo straight away.
 */
function Logos({ event, run }: { event: FundraiserEvent; run: Run }) {
  const logoFiles = useAssets("sponsor-logos");
  const [draft, setDraft, dirty] = useDraft({ title: event.sponsorsTitle, sponsors: event.sponsors });
  const [uploading, setUploading] = useState(false);
  const { sponsors } = draft;
  const setSponsors = (next: typeof sponsors) => setDraft({ ...draft, sponsors: next });
  const patchFor = (d: typeof draft) => ({
    sponsorsTitle: d.title.trim(),
    sponsors: d.sponsors.map((s, i) => ({ ...s, name: s.name.trim() || "Logo", sortOrder: i })),
  });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const logoUrl = await uploadAsset("sponsor-logos", file);
        added.push({ id: newId(), name: nameFromFile(file.name), logoUrl, sortOrder: 0 });
      }
      const next = { ...draft, sponsors: [...sponsors, ...added] };
      setDraft(next);
      run(send("updateEvent", { eventId: event.id, patch: patchFor(next) }));
    } catch (err) {
      run(Promise.reject(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Logos rotate on the Main screen and in the info bar: your sponsors, or the causes the event helps. The heading
        goes over them.
      </p>
      <label className="field">
        <span>Heading</span>
        <input
          list="logo-headings"
          maxLength={60}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <datalist id="logo-headings">
          {LOGO_HEADINGS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Add logos (PNG, JPG or SVG; pick several at once)</span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => void upload(e.target.files)}
        />
        {uploading && <span className="muted">Uploading…</span>}
      </label>
      {sponsors.map((sponsor, index) => (
        <div className="list-row" key={sponsor.id}>
          {sponsor.logoUrl && <img src={sponsor.logoUrl} alt="" className="logo-thumb" />}
          <input
            aria-label="Name"
            placeholder="Name (shown if the logo can't load)"
            value={sponsor.name}
            onChange={(e) => setSponsors(sponsors.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)))}
          />
          <AssetSelect
            label="Logo"
            assets={logoFiles}
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
        <button
          type="button"
          onClick={() =>
            setSponsors([...sponsors, { id: newId(), name: "", logoUrl: null, sortOrder: sponsors.length }])
          }
        >
          Add a name without a logo
        </button>
        <button
          type="button"
          className="primary"
          disabled={!dirty}
          onClick={() => run(send("updateEvent", { eventId: event.id, patch: patchFor(draft) }))}
        >
          Save logos
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
          announcements: draft.announcements
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean),
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
      <SaveToggle
        checked={event.celebrateAtClose}
        label="When bidding closes, switch the TVs to the Celebration"
        hint="Off: the TVs announce 10, 5 and 1 minute left and that bidding has closed, and you start the Celebration yourself (best if the program goes on after bidding closes). Not while Ask Me is on."
        onChange={(celebrateAtClose) => run(send("updateEvent", { eventId: event.id, patch: { celebrateAtClose } }))}
      />
      <label className="field">
        <span>Announcements, one per line (**bold** and *italics* work)</span>
        <textarea rows={4} {...field("announcements")} />
      </label>
      <label className="field">
        <span>Ask Me title (when there are no planned rounds)</span>
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
        {dirty && (
          <button type="button" onClick={() => setDraft(saved)}>
            Discard
          </button>
        )}
      </div>
    </>
  );
}

/** A setting that saves as soon as it's ticked. */
function SaveToggle(props: { checked: boolean; label: string; hint: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="row toggle" style={{ alignItems: "baseline" }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        {props.label}
        <br />
        <span className="muted">{props.hint}</span>
      </span>
    </label>
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
  if (!event) {
    return (
      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          No events yet. The guide walks you through setting one up.
        </p>
        <button
          type="button"
          className="primary guide-button"
          onClick={() => (window.top!.location.hash = "fullbleed/setup")}
        >
          Set up your first event
        </button>
      </div>
    );
  }

  const run: Run = (promise) => {
    setError(null);
    promise.catch((err) => setError(errorText(err)));
  };
  const save = (patch: Parameters<typeof send<"updateEvent">>[1]["patch"]) =>
    run(send("updateEvent", { eventId: event.id, patch }));

  return (
    <div className="panel">
      <label className="field">
        <span className="muted">Event</span>
        <select value={event.id} onChange={(e) => setSelectedId(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.id === activeId ? " (on the TVs)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* key: drafts reset when switching events */}
      <div key={event.id} className="panel" style={{ padding: 0 }}>
        <h3 className="group-heading">About the event</h3>
        <Section title="Event details" hint="The name, cause and closing time shown on every screen.">
          <EventDetails event={event} run={run} />
        </Section>
        <Section
          title={`Look and logos (${event.sponsors.length} logo${event.sponsors.length === 1 ? "" : "s"})`}
          hint="The event's colors, logo and fonts, and the logos the TVs rotate through."
        >
          <LookAndLogos event={event} run={run} />
        </Section>
        <h3 className="group-heading">Goals and extras</h3>
        <Section
          title={`Milestones (${event.milestones.length})`}
          hint="When the total passes one, the TVs celebrate for a few seconds. A label says what it pays for."
        >
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
        <Section
          title={`Incentives (${event.incentives.length})`}
          hint="Goals with a progress bar in the info bar. In rotation: shown in turn. Pin now: kept on screen. Pin until met: kept on screen until reached."
        >
          <ListEditor
            items={event.incentives}
            fields={[
              { key: "name", label: "Name", type: "text" },
              { key: "target", label: "Target", type: "number" },
              { key: "active", label: "In rotation", type: "checkbox" },
              { key: "displayNow", label: "Pin now", type: "checkbox" },
              { key: "displayUntilMet", label: "Pin until met", type: "checkbox" },
            ]}
            blank={() => ({
              id: newId(),
              name: "",
              target: 0,
              active: true,
              displayNow: false,
              displayUntilMet: false,
            })}
            addLabel="Add incentive"
            onSave={(incentives) => save({ incentives })}
          />
        </Section>
        <Section
          title={`Bid wars (${event.bidWars.length})`}
          hint="Options people vote for with money, like naming a kitten. Add amounts during the show in the Live tab."
        >
          <BidWars event={event} run={run} />
        </Section>
        <Section title={`Ask Me rounds (${event.askMeRounds.length})`}>
          <p className="muted">
            Plan each Ask Me appeal of the night, in order. Finishing one celebrates it and moves the TVs on to the
            next; after the last, the TVs go back to the scene from before Ask Me. With none planned, Ask Me is one
            appeal (its title and message are in Event details) that you can run as many times as you like. Long
            messages shrink to fit the TV; about 300 characters or fewer reads best from across the room.
          </p>
          <SaveToggle
            checked={event.askMeInTotal}
            label="Add Ask Me money to the total on the TVs"
            hint="Leave this off if Ask Me gifts also go into the auction (for example as an item): its total already has them, and adding them here would count them twice. Turn it on if Ask Me money is only counted here."
            onChange={(askMeInTotal) => save({ askMeInTotal })}
          />
          <ListEditor
            items={event.askMeRounds}
            fields={[
              { key: "title", label: "Title, e.g. Fund a kennel", type: "text", width: 220 },
              { key: "message", label: "Message (Markdown: **bold**)", type: "text", width: 320 },
            ]}
            blank={() => ({ id: newId(), title: "", message: "", raised: null })}
            addLabel="Add an Ask Me round"
            onSave={(askMeRounds) => save({ askMeRounds })}
          />
        </Section>
        <Section
          title={`Prizes (${event.prizes.length})`}
          hint="Prize draws shown in the info bar, with the minimum donation to enter."
        >
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
        <h3 className="group-heading">On the TV</h3>
        <Section
          title="Call to action"
          hint="One line telling people how to give, shown in the info bar and on the Welcome screen."
        >
          <CallToAction event={event} run={run} />
        </Section>
        <Section
          title="Info bar rotation"
          hint="What the strip along the bottom of the TV cycles through, and for how long."
        >
          <InfoBarEditor event={event} run={run} />
        </Section>
        <Section
          title={`Hidden items (${event.filters.length})`}
          hint="Auction items to keep off the TVs, matched by a word in their title (for example raffle)."
        >
          <HiddenItems event={event} run={run} />
        </Section>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ShowContent />);
