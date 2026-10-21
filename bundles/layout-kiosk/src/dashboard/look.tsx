import { useEffect, useRef, useState } from "react";
import {
  ColorFields,
  FontPicker,
  PaletteSwatches,
  errorText,
  uploadAsset,
  useLogoColors,
  usePreviewTheme,
  useReplicant,
} from "@32dashboards/nodecg-react";
import "@32dashboards/nodecg-react/look.css";
import {
  SCREEN_VIEWS,
  type ActiveEventIdReplicant,
  type EventTheme,
  type EventsReplicant,
  type ScreenView,
} from "@32dashboards/schema/core";
import { validateTheme } from "@32dashboards/ui";
import { builtInLayouts } from "../layouts.js";
import { readStored, writeStored, LOOK_EVENT_KEY } from "./shared.js";

/*
 * An event's look (colors, logo, fonts) beside a live preview of the kiosk.
 * Changes show in the preview as you make them (posted to the iframe) and
 * reach the TVs when saved. Looks belong to events, not layouts, so one
 * layout serves every event's brand.
 */

const CORE = "fundraiser-core";

const VIEW_NAMES: Record<ScreenView, string> = {
  main: "Main",
  intermission: "Intermission",
  askMe: "Ask Me",
  celebration: "Celebration",
  standby: "Standby",
};

interface Asset {
  base: string;
  url: string;
}

type Run = (promise: Promise<unknown>, done?: string) => Promise<unknown>;

export function LookEditor({ layoutId, layoutView, run }: { layoutId: string; layoutView: ScreenView; run: Run }) {
  const events = useReplicant<EventsReplicant>("events", CORE);
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId", CORE) ?? null;
  const logos = useReplicant<Asset[]>("assets:event-logos", CORE) ?? [];
  const [eventId, setEventId] = useState<string | null>(() => readStored(LOOK_EVENT_KEY));
  const [view, setView] = useState<ScreenView>(layoutView);

  if (!events) return <p className="muted">Waiting for events…</p>;
  if (events.length === 0) {
    return <p className="look-empty">Looks belong to events. Create one in the Events panel on the Event tab first.</p>;
  }
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const event = sorted.find((e) => e.id === eventId) ?? sorted.find((e) => e.id === activeId) ?? sorted[0]!;
  const pick = (id: string) => {
    setEventId(id);
    writeStored(LOOK_EVENT_KEY, id);
  };
  // Preview the layout being edited when it's for this scene, else the scene's built-in one.
  const previewLayout = view === layoutView ? layoutId : builtInLayouts[view].id;

  return (
    <EventLook
      key={event.id}
      eventId={event.id}
      eventName={event.name}
      onScreen={event.id === activeId}
      saved={event.theme}
      logos={logos}
      events={sorted.map((e) => ({ id: e.id, name: e.name }))}
      onPickEvent={pick}
      view={view}
      onView={setView}
      previewLayout={previewLayout}
      run={run}
    />
  );
}

function EventLook(props: {
  eventId: string;
  eventName: string;
  onScreen: boolean;
  saved: EventTheme;
  logos: Asset[];
  events: { id: string; name: string }[];
  onPickEvent: (id: string) => void;
  view: ScreenView;
  onView: (view: ScreenView) => void;
  previewLayout: string;
  run: Run;
}) {
  const { saved, run } = props;
  const savedJson = JSON.stringify(saved);
  const [theme, setTheme] = useState<EventTheme>(saved);
  const dirty = JSON.stringify(theme) !== savedJson;
  // Take a newly saved look (here or elsewhere) unless there are unsaved changes.
  const lastSaved = useRef(savedJson);
  useEffect(() => {
    if (savedJson === lastSaved.current) return;
    const wasClean = JSON.stringify(theme) === lastSaved.current;
    lastSaved.current = savedJson;
    if (wasClean) setTheme(JSON.parse(savedJson) as EventTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson]);

  const issues = validateTheme(theme);
  const set = (patch: Partial<EventTheme>) => setTheme((t) => ({ ...t, ...patch }));

  // Show the draft look in the preview as it changes.
  const frame = useRef<HTMLIFrameElement>(null);
  usePreviewTheme(frame, theme);
  const fromLogo = useLogoColors(theme.logoUrl);
  const [uploading, setUploading] = useState<string | null>(null);

  const params = new URLSearchParams({ layout: props.previewLayout, view: props.view });
  if (!props.onScreen) params.set("sample", "demo");
  const previewUrl = `../graphics/kiosk.html?preview&${params.toString()}`;

  return (
    <div className="look">
      <aside className="look__form" aria-label="Event look">
        <label className="field">
          <span className="muted">Look for event</span>
          <select className="look__event" value={props.eventId} onChange={(e) => props.onPickEvent(e.target.value)}>
            {props.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <section className="look__group">
          <h2>Start from colors that work</h2>
          <PaletteSwatches theme={theme} suggested={fromLogo} onPick={(colors) => set(colors)} />
        </section>

        <section className="look__group">
          <h2>Colors</h2>
          <ColorFields theme={theme} onChange={set} />
        </section>

        <section className="look__group">
          <h2>Logo</h2>
          <select
            aria-label="Event logo"
            value={theme.logoUrl ?? ""}
            onChange={(e) => set({ logoUrl: e.target.value || null })}
          >
            <option value="">No logo</option>
            {theme.logoUrl && !props.logos.some((a) => a.url === theme.logoUrl) && (
              <option value={theme.logoUrl}>{theme.logoUrl} (not found)</option>
            )}
            {props.logos.map((a) => (
              <option key={a.url} value={a.url}>
                {a.base}
              </option>
            ))}
          </select>
          <label className="upload">
            <span>{uploading ?? "Upload a logo"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploading(`Uploading ${file.name}…`);
                uploadAsset("event-logos", file).then(
                  (logoUrl) => {
                    setUploading(null);
                    set({ logoUrl });
                  },
                  (err) => setUploading(errorText(err)),
                );
              }}
            />
          </label>
          {fromLogo && <p className="muted">The first palette above comes from your logo.</p>}
        </section>

        <FontPicker
          title="Words"
          kind="display"
          sample={props.eventName || "Spring Gala"}
          value={theme.fontDisplay}
          onChange={(fontDisplay) => set({ fontDisplay })}
        />
        <FontPicker
          title="Numbers"
          kind="numbers"
          sample="$12,480"
          value={theme.fontMono}
          onChange={(fontMono) => set({ fontMono })}
        />
      </aside>

      <section className="look__preview" aria-label="Preview">
        <div className="row look__views" role="group" aria-label="Scene to preview">
          {SCREEN_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className="chip"
              aria-pressed={props.view === v}
              onClick={() => props.onView(v)}
            >
              {VIEW_NAMES[v]}
            </button>
          ))}
        </div>
        <div className="look__frame">
          <iframe ref={frame} src={previewUrl} title="Preview of this look on a TV" tabIndex={-1} />
        </div>
        <p className="muted">
          {props.onScreen
            ? "This event is on screen: the preview shows its real content."
            : "Shown with a sample show, since this event isn't on screen."}
        </p>
        <div className="look__save">
          <button
            type="button"
            className="primary"
            disabled={!dirty || issues.some((i) => i.level === "error")}
            onClick={() =>
              void run(
                sendTheme(props.eventId, theme),
                props.onScreen ? "Look saved. The TVs show it now." : "Look saved.",
              ).catch(() => {})
            }
          >
            Save look
          </button>
          <button type="button" disabled={!dirty} onClick={() => setTheme(JSON.parse(savedJson) as EventTheme)}>
            Revert
          </button>
          <span className="muted">{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
      </section>
    </div>
  );
}

function sendTheme(eventId: string, theme: EventTheme) {
  return nodecg.sendMessageToBundle("updateEvent", CORE, { eventId, patch: { theme } });
}
