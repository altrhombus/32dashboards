import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmButton, errorText, useNow, useReplicant } from "@32dashboards/nodecg-react";
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
import type { LayoutsReplicant, SavedLayout } from "../library.js";
import "@32dashboards/nodecg-react/panel.css";
import "./screens.css";
import { SELECTED_LAYOUT_KEY, readStored, writeStored } from "./shared.js";
import { VIEW_NAMES } from "../views.js";

/*
 * Screens: name the TVs, choose what each shows for every scene,
 * and keep copies of layouts. Editing a layout's blocks happens in the
 * Layouts tab (builder.tsx).
 */

const CORE = "fundraiser-core";

const sendCore = <N extends CoreMessageName>(name: N, payload: CoreMessagePayload<N>) =>
  nodecg.sendMessageToBundle(name, CORE, payload);

/** Opens a layout in the Layouts tab (the builder). */
function openInBuilder(layoutId: string) {
  writeStored(SELECTED_LAYOUT_KEY, layoutId);
  try {
    window.top!.location.hash = "fullbleed/builder";
  } catch {
    window.open("/dashboard/#fullbleed/builder", "_top");
  }
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "Main room left" -> "main-room-left", fit for a URL. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

type Run = (promise: Promise<unknown>, done?: string) => void;

/** The display-only token in TV links, and a way to replace it. */
function useDisplayToken(run: Run) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    nodecg.sendMessage("displayToken").then(
      (value) => setToken(value as string),
      () => {},
    );
  }, []);
  const replace = useCallback(() => {
    run(
      nodecg.sendMessage("replaceDisplayToken").then((value) => setToken(value as string)),
      "Replaced. TVs using the old link stop updating until you open the new one.",
    );
  }, [run]);
  return { token, replace };
}

function ScreensPanel() {
  const screens = useReplicant<ScreensReplicant>("screens", CORE);
  const outputs = useReplicant<OutputsReplicant>("outputs", CORE) ?? [];
  const layouts = useReplicant<LayoutsReplicant>("layouts");
  const now = useNow();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [newScreenId, setNewScreenId] = useState("");

  const run = useCallback<Run>((promise, done) => {
    setMessage(null);
    promise.then(
      () => done && setMessage({ text: done }),
      (err) => setMessage({ text: errorText(err), error: true }),
    );
  }, []);
  const { token, replace } = useDisplayToken(run);

  if (!screens || !layouts) return <p className="panel">Waiting for state…</p>;

  const presence = screenPresence(screens, outputs, now);

  return (
    <div className="panel">
      <section className="group" aria-labelledby="screens-heading">
        <h2 id="screens-heading">Screens</h2>
        {screens.length === 0 && (
          <p className="muted">
            No named screens yet, so every TV shows the built-in layouts. Name each TV to choose what it shows and to
            see whether it's connected.
          </p>
        )}
        {presence.named.map(({ screen, connected, since }) => (
          <ScreenCard
            key={screen.id}
            screen={screen}
            connected={connected}
            since={since}
            layouts={layouts}
            token={token}
            run={run}
          />
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

      <section className="group" aria-label="TV links">
        <p className="muted">
          TV links can show the TV picture and nothing else: they can't open this dashboard or change the show. If one
          ends up somewhere it shouldn't, replace them, then open each TV's new link.
        </p>
        <div className="row">
          <ConfirmButton
            label="Replace the TV links"
            confirmLabel="Tap again: open TVs stop updating"
            onConfirm={replace}
          />
        </div>
      </section>

      <section className="group" aria-label="Layouts">
        <p className="muted">
          Build, copy, rename and delete layouts in the Layouts tab. Each screen above picks one for every scene.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={() => openInBuilder(readStored(SELECTED_LAYOUT_KEY) ?? builtInLayouts.main.id)}
          >
            Open the Layouts tab
          </button>
        </div>
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
  token: string | null;
  run: Run;
}) {
  const { screen, connected, since, layouts, token, run } = props;
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
      <OpenOnTv screenId={screen.id} token={token} />
      <TextSize screen={screen} onSave={(textSize) => save({ ...screen, textSize }, "Text size saved.")} />
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

/**
 * Bigger or smaller text on every block of one TV, for a small or far-away
 * screen. Saved when the slider is let go, and shown on that TV right away.
 */
function TextSize({ screen, onSave }: { screen: Screen; onSave: (textSize: number | undefined) => void }) {
  const saved = Math.round((screen.textSize ?? 1) * 100);
  const [percent, setPercent] = useState(saved);
  useEffect(() => setPercent(saved), [saved]);
  const commit = () => {
    if (percent !== saved) onSave(percent === 100 ? undefined : percent / 100);
  };
  return (
    <label className="field">
      <span>
        Text size on this TV: {percent}%
        {saved !== 100 && (
          <button type="button" className="link-button" onClick={() => onSave(undefined)}>
            Reset
          </button>
        )}
      </span>
      <input
        type="range"
        min={70}
        max={160}
        step={5}
        value={percent}
        onChange={(e) => setPercent(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="muted">
        Makes the words and numbers in every part of this TV bigger or smaller, for a small screen or one far from the
        room. Watch the TV as you let go.
      </span>
    </label>
  );
}

const LOOPBACK = /^(127\.|localhost$|\[?::1\]?$)/;

/**
 * How to show a screen's TV picture: on this computer in one click, or by
 * its link on another computer (with this laptop's network address in it).
 */
function OpenOnTv({ screenId, token }: { screenId: string; token: string | null }) {
  const [address, setAddress] = useState<string | null>(LOOPBACK.test(location.hostname) ? null : location.host);
  useEffect(() => {
    if (address) return;
    sendCore("connectionInfo", undefined).then(
      (reply) => {
        const { port, addresses } = reply as { port: number; addresses: string[] };
        if (addresses[0]) setAddress(`${addresses[0]}:${port}`);
      },
      () => {},
    );
  }, [address]);
  if (!token) return <p className="muted">Getting this screen's TV link…</p>;
  const path = `/bundles/layout-kiosk/graphics/kiosk.html?key=${encodeURIComponent(token)}&screen=${screenId}`;
  return (
    <div className="open-tv">
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => window.open(path, `kiosk-${screenId}`, "popup,width=1280,height=720")}
        >
          Open on this computer
        </button>
        <span className="muted">
          Drag the window onto the TV (or press Windows+Shift+arrow), then double-click it to fill the screen.
        </span>
      </div>
      {address && (
        <label className="field">
          <span className="muted">
            Or, on another computer on the same network, open this link in Edge or Chrome, then double-click the
            picture:
          </span>
          <input readOnly value={`http://${address}${path}`} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
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
        <input
          placeholder="e.g. Main room left"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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

createRoot(document.getElementById("root")!).render(<ScreensPanel />);
