import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmButton, errorText, useReplicant } from "@32dashboards/nodecg-react";
import {
  SCREEN_VIEWS,
  ScreenIdSchema,
  screenPresence,
  type CoreMessageName,
  type CoreMessagePayload,
  type OutputsReplicant,
  type Screen,
  type ScreensReplicant,
  type ScreenView,
} from "@32dashboards/schema/core";
import { builtInLayouts } from "../layouts.js";
import type { KioskMessageName, KioskMessagePayload, LayoutsReplicant, SavedLayout } from "../library.js";
import "@32dashboards/nodecg-react/panel.css";
import "./screens.css";

/*
 * Screens and layouts: name the TVs, choose what each shows for every scene,
 * and keep copies of layouts. Editing a layout's blocks comes with the
 * layout builder.
 */

const CORE = "fundraiser-core";

const sendCore = <N extends CoreMessageName>(name: N, payload: CoreMessagePayload<N>) =>
  nodecg.sendMessageToBundle(name, CORE, payload);
const sendKiosk = <N extends KioskMessageName>(name: N, payload: KioskMessagePayload<N>) =>
  nodecg.sendMessage(name, payload);

const VIEW_NAMES: Record<ScreenView, string> = {
  main: "Main",
  intermission: "Intermission",
  askMe: "Ask Me",
  celebration: "Celebration",
  standby: "Standby",
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "Main room left" -> "main-room-left", fit for a URL. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

type Run = (promise: Promise<unknown>, done?: string) => void;

function useNow(ms = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function ScreensPanel() {
  const screens = useReplicant<ScreensReplicant>("screens", CORE);
  const outputs = useReplicant<OutputsReplicant>("outputs", CORE) ?? [];
  const layouts = useReplicant<LayoutsReplicant>("layouts");
  const now = useNow();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [newScreenId, setNewScreenId] = useState("");

  if (!screens || !layouts) return <p className="panel">Waiting for state…</p>;

  const run: Run = (promise, done) => {
    setMessage(null);
    promise.then(
      () => done && setMessage({ text: done }),
      (err) => setMessage({ text: errorText(err), error: true }),
    );
  };
  const presence = screenPresence(screens, outputs, now);

  return (
    <div className="panel">
      <section className="group" aria-labelledby="screens-heading">
        <h2 id="screens-heading">Screens</h2>
        {screens.length === 0 && (
          <p className="muted">
            No named screens yet, so every TV shows the built-in layouts. Name each TV to choose what it shows and to see
            whether it's connected.
          </p>
        )}
        {presence.named.map(({ screen, connected, since }) => (
          <ScreenCard key={screen.id} screen={screen} connected={connected} since={since} layouts={layouts} run={run} />
        ))}
        {presence.unnamed.map((u, i) => (
          <div key={i} className="row unnamed">
            <span className="status-dot status-dot--caution" aria-hidden="true" />
            <span>
              {u.screenId ? (
                <>
                  A TV is open as <code>{u.screenId}</code>, which isn't set up.
                </>
              ) : (
                "A TV is open without a screen name, so it shows the built-in layouts."
              )}
            </span>
            {u.screenId && (
              <button type="button" onClick={() => setNewScreenId(u.screenId!)}>
                Set it up
              </button>
            )}
          </div>
        ))}
        <AddScreen key={newScreenId} initialId={newScreenId} taken={screens.map((s) => s.id)} run={run} />
      </section>

      <section className="group" aria-labelledby="layouts-heading">
        <h2 id="layouts-heading">Layouts</h2>
        <p className="muted">
          Copy a layout to give it to a screen under its own name. Changing what's in a layout comes with the layout
          builder.
        </p>
        <ul className="layouts">
          {Object.values(builtInLayouts).map((b) => (
            <li key={b.id} className="list-row">
              <span className="layout-name">{b.name}</span>
              <span className="muted">Built in</span>
              <button type="button" onClick={() => run(sendKiosk("copyLayout", { fromId: b.id }), `Copied ${b.name}.`)}>
                Copy
              </button>
            </li>
          ))}
          {layouts.map((layout) => (
            <SavedLayoutRow key={layout.id} layout={layout} screens={screens} run={run} />
          ))}
        </ul>
      </section>

      {message && (
        <p className={message.error ? "error" : "status-ok"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

function ScreenCard(props: {
  screen: Screen;
  connected: boolean;
  since: string | null;
  layouts: SavedLayout[];
  run: Run;
}) {
  const { screen, connected, since, layouts, run } = props;
  const [name, setName] = useState(screen.name);
  useEffect(() => setName(screen.name), [screen.name]);

  const save = (next: Screen, done?: string) => run(sendCore("saveScreen", next), done);
  const choose = (view: ScreenView, ref: string) => {
    const chosen = { ...screen.layouts };
    if (ref) chosen[view] = ref;
    else delete chosen[view];
    save({ ...screen, layouts: chosen });
  };

  return (
    <div className="event screen">
      <div className="row">
        <span className={`status-dot ${connected ? "status-dot--go" : "status-dot--caution"}`} aria-hidden="true" />
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== screen.name) save({ ...screen, name: name.trim() }, "Renamed.");
          }}
        >
          <input
            aria-label="Screen name"
            className="grow"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </form>
        <span className={connected ? "status-ok" : "warning"}>
          {connected ? `Connected since ${clock(since!)}` : "Not connected"}
        </span>
      </div>
      <p className="muted">
        Open it on its TV with <code>pnpm -s kiosk-url {screen.id}</code> in WSL, or{" "}
        <code>open-kiosk.ps1 -Screen {screen.id}</code>.
      </p>
      <div className="views">
        {SCREEN_VIEWS.map((view) => (
          <label key={view} className="field">
            <span className="muted">{VIEW_NAMES[view]}</span>
            <select value={screen.layouts[view] ?? ""} onChange={(e) => choose(view, e.target.value)}>
              <option value="">Built-in</option>
              <LayoutOptions view={view} layouts={layouts} />
            </select>
          </label>
        ))}
      </div>
      <div className="row">
        <ConfirmButton
          label="Remove screen"
          confirmLabel="Tap again to remove"
          onConfirm={() => run(sendCore("deleteScreen", { id: screen.id }), `Removed ${screen.name}.`)}
        />
      </div>
    </div>
  );
}

/** Saved layouts made for this scene first, then everything else. */
function LayoutOptions({ view, layouts }: { view: ScreenView; layouts: SavedLayout[] }) {
  const forView = layouts.filter((l) => l.view === view);
  const others = [
    ...layouts.filter((l) => l.view !== view).map((l) => ({ id: l.id, name: l.name })),
    ...Object.values(builtInLayouts)
      .filter((b) => b.view !== view)
      .map((b) => ({ id: b.id, name: `Built-in ${b.name}` })),
  ];
  return (
    <>
      {forView.length > 0 && (
        <optgroup label={`Made for ${VIEW_NAMES[view]}`}>
          {forView.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Others">
        {others.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

function AddScreen({ initialId, taken, run }: { initialId: string; taken: string[]; run: Run }) {
  const [name, setName] = useState("");
  const [id, setId] = useState(initialId);
  const [idEdited, setIdEdited] = useState(Boolean(initialId));
  const effectiveId = idEdited ? id : slug(name);
  const idProblem = !effectiveId
    ? null
    : taken.includes(effectiveId)
      ? "Another screen already uses this id."
      : (ScreenIdSchema.safeParse(effectiveId).error?.issues[0]?.message ?? null);

  return (
    <form
      className="add-screen"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !effectiveId || idProblem) return;
        run(sendCore("saveScreen", { id: effectiveId, name: name.trim(), layouts: {} }), `Added ${name.trim()}.`);
        setName("");
        setId("");
        setIdEdited(false);
      }}
    >
      <label className="field">
        <span>New screen</span>
        <input placeholder="e.g. Main room left" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="muted">Id in its address</span>
        <input
          value={effectiveId}
          maxLength={40}
          onChange={(e) => {
            setIdEdited(true);
            setId(e.target.value);
          }}
        />
      </label>
      <button type="submit" className="primary" disabled={!name.trim() || !effectiveId || Boolean(idProblem)}>
        Add screen
      </button>
      {idProblem && <p className="warning">{idProblem}</p>}
    </form>
  );
}

function SavedLayoutRow({ layout, screens, run }: { layout: SavedLayout; screens: Screen[]; run: Run }) {
  const [name, setName] = useState(layout.name);
  useEffect(() => setName(layout.name), [layout.name]);
  const users = screens.filter((s) => Object.values(s.layouts).includes(layout.id)).map((s) => s.name);

  return (
    <li className="list-row">
      <form
        className="grow"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== layout.name) {
            run(sendKiosk("renameLayout", { layoutId: layout.id, name: name.trim() }), "Renamed.");
          }
        }}
      >
        <input
          aria-label="Layout name"
          className="layout-name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </form>
      <span className="muted">
        Made for {VIEW_NAMES[layout.view]}
        {users.length > 0 && `, on ${users.join(", ")}`}
        {layout.draft && ", has unpublished changes"}
      </span>
      <button type="button" onClick={() => run(sendKiosk("copyLayout", { fromId: layout.id }), `Copied ${layout.name}.`)}>
        Copy
      </button>
      <ConfirmButton
        label="Delete"
        confirmLabel="Tap again to delete"
        disabled={users.length > 0}
        onConfirm={() => run(sendKiosk("deleteLayout", { layoutId: layout.id }), `Deleted ${layout.name}.`)}
      />
    </li>
  );
}

createRoot(document.getElementById("root")!).render(<ScreensPanel />);
