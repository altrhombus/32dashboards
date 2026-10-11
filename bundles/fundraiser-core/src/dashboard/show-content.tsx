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
  const move = (index: number, by: number) => {
    const segments = [...draft.segments];
    const [item] = segments.splice(index, 1);
    segments.splice(index + by, 0, item!);
    setDraft({ ...draft, segments });
  };
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
  const themeIssues = validateTheme(event.theme);

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
        <Section title={`Theme check (${themeIssues.length ? `${themeIssues.length} issue${themeIssues.length === 1 ? "" : "s"}` : "OK"})`}>
          {themeIssues.length === 0 && <p className="muted">Colors meet contrast and broadcast-safe rules.</p>}
          {themeIssues.map((issue, i) => (
            <p key={i} className={issue.level === "error" ? "error" : "warning"}>
              {issue.field}: {issue.message}
            </p>
          ))}
        </Section>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ShowContent />);
