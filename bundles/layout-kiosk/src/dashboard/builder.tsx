import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import GridLayout, { getCompactor, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { cellSize, contentScale, type BlockLayout } from "@32dashboards/layout-engine/data";
import { ConfirmButton, errorText, useReplicant } from "@32dashboards/nodecg-react";
import {
  SCREEN_VIEWS,
  type LiveStateReplicant,
  type ScreensReplicant,
  type ScreenView,
} from "@32dashboards/schema/core";
import * as edit from "../builder/edit.js";
import { kioskCatalog } from "../catalog.js";
import { builtInById, builtInLayouts, templates } from "../layouts.js";
import { checkLayout, type KioskMessageName, type KioskMessagePayload, type LayoutsReplicant } from "../library.js";
import "@32dashboards/nodecg-react/panel.css";
import "./builder.css";
import { SELECTED_LAYOUT_KEY as SELECTED_KEY, readStored, writeStored } from "./shared.js";

/*
 * The layout builder: arrange the kiosk's components on the 24x24 grid over a
 * live preview of the real kiosk. Edits save as a draft as you go; screens
 * keep showing the published version until you publish.
 */

const CORE = "fundraiser-core";
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const SAVE_DELAY_MS = 600;
const HISTORY_LIMIT = 50;

const sendKiosk = <N extends KioskMessageName>(name: N, payload: KioskMessagePayload<N>) =>
  nodecg.sendMessage(name, payload);

const VIEW_NAMES: Record<ScreenView, string> = {
  main: "Main",
  intermission: "Intermission",
  askMe: "Ask Me",
  celebration: "Celebration",
  standby: "Standby",
};

const CATEGORY_NAMES = { money: "Money", items: "Items", show: "Show", brand: "Brand", scene: "Whole scenes" } as const;

type PreviewData = "event" | "demo" | "worst";

interface Note {
  text: string;
  error?: boolean;
}

function Builder() {
  const layouts = useReplicant<LayoutsReplicant>("layouts");
  const screens = useReplicant<ScreensReplicant>("screens", CORE) ?? [];
  const live = useReplicant<LiveStateReplicant>("liveState", CORE);
  const [selectedId, setSelectedId] = useState(() => readStored(SELECTED_KEY) ?? builtInLayouts.main.id);
  const [note, setNote] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);

  // The Screens and layouts panel opens a layout by writing its id.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === SELECTED_KEY && e.newValue && setSelectedId(e.newValue);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const select = (id: string) => {
    setSelectedId(id);
    writeStored(SELECTED_KEY, id);
  };

  const run = useCallback((promise: Promise<unknown>, done?: string) => {
    setNote(null);
    return promise.then(
      (reply) => {
        if (done) setNote({ text: done });
        return reply;
      },
      (err) => {
        setNote({ text: errorText(err), error: true });
        throw err;
      },
    );
  }, []);

  if (!layouts) return <p className="builder-loading">Waiting for state…</p>;

  const saved = layouts.find((l) => l.id === selectedId);
  const builtIn = saved ? undefined : (builtInById(selectedId) ?? builtInLayouts.main);
  const usedOn = screens
    .flatMap((s) => SCREEN_VIEWS.filter((v) => s.layouts[v] === (saved?.id ?? builtIn?.id)).map((v) => `${s.name} (${VIEW_NAMES[v]})`));

  return (
    <div className="builder">
      <header className="topbar">
        <label className="picker">
          <span className="visually-hidden">Layout</span>
          <select value={saved?.id ?? builtIn!.id} onChange={(e) => select(e.target.value)}>
            {layouts.length > 0 && (
              <optgroup label="Your layouts">
                {layouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.draft ? " (unpublished changes)" : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Built in (copy to change)">
              {Object.values(builtInLayouts).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button type="button" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
          New layout
        </button>
        <button
          type="button"
          onClick={() =>
            run(sendKiosk("copyLayout", { fromId: saved?.id ?? builtIn!.id }), "Copied. You're editing the copy.").then(
              (id) => select(String(id)),
              () => {},
            )
          }
        >
          {builtIn ? "Copy to change it" : "Copy"}
        </button>
        <span className="topbar__where muted">
          {usedOn.length ? `On ${usedOn.join(", ")}` : "Not on any screen yet"}
        </span>
      </header>

      {creating && (
        <NewLayout
          onCancel={() => setCreating(false)}
          onCreate={(input) =>
            run(sendKiosk("copyLayout", input), `Created "${input.name}".`).then(
              (id) => {
                setCreating(false);
                select(String(id));
              },
              () => {},
            )
          }
        />
      )}

      {saved ? (
        <Editor
          key={saved.id}
          layoutId={saved.id}
          name={saved.name}
          view={saved.view}
          serverBlocks={saved.draft ?? saved.published}
          hasDraft={saved.draft !== null}
          inUse={usedOn.length > 0}
          eventOnScreen={Boolean(live?.event)}
          run={run}
          onDeleted={() => select(builtInLayouts[saved.view].id)}
        />
      ) : (
        <Editor
          key={builtIn!.id}
          layoutId={builtIn!.id}
          name={builtIn!.name}
          view={builtIn!.view}
          serverBlocks={builtIn!.blocks}
          hasDraft={false}
          inUse={usedOn.length > 0}
          eventOnScreen={Boolean(live?.event)}
          run={run}
          readOnly
        />
      )}

      <p className={`builder-note ${note?.error ? "error" : "status-ok"}`} role="status" aria-live="polite">
        {note?.text}
      </p>
    </div>
  );
}

function NewLayout(props: {
  onCancel: () => void;
  onCreate: (input: { fromId: string; name: string; view: ScreenView }) => void;
}) {
  const [name, setName] = useState("");
  const [view, setView] = useState<ScreenView>("main");
  const [from, setFrom] = useState(templates[1]?.id ?? templates[0]!.id);
  return (
    <form
      className="new-layout"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) props.onCreate({ fromId: from, name: name.trim(), view });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input autoFocus maxLength={60} placeholder="e.g. Lobby, big total" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>For which scene</span>
        <select value={view} onChange={(e) => setView(e.target.value as ScreenView)}>
          {SCREEN_VIEWS.map((v) => (
            <option key={v} value={v}>
              {VIEW_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field starts">
        <legend>Start from</legend>
        {templates.map((t) => (
          <label key={t.id} className="start">
            <input type="radio" name="from" value={t.id} checked={from === t.id} onChange={() => setFrom(t.id)} />
            <span>
              <strong>{t.name}</strong> <span className="muted">{t.description}</span>
            </span>
          </label>
        ))}
        <label className="start">
          <input
            type="radio"
            name="from"
            checked={from === builtInLayouts[view].id}
            onChange={() => setFrom(builtInLayouts[view].id)}
          />
          <span>
            <strong>Built-in {VIEW_NAMES[view]}</strong> <span className="muted">The layout screens show today.</span>
          </span>
        </label>
      </fieldset>
      <div className="row">
        <button type="submit" className="primary" disabled={!name.trim()}>
          Create layout
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type SaveState = "saved" | "pending" | "saving" | "blocked";

interface EditState {
  working: BlockLayout;
  past: BlockLayout[];
  future: BlockLayout[];
}

type EditAction =
  | { type: "change"; next: (current: BlockLayout) => BlockLayout }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; working: BlockLayout };

/** The working copy with undo and redo. Pure, so React may call it twice. */
function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "change": {
      const working = action.next(state.working);
      if (working === state.working) return state;
      return { working, past: [...state.past, state.working].slice(-HISTORY_LIMIT), future: [] };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { working: previous, past: state.past.slice(0, -1), future: [state.working, ...state.future] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { working: next, past: [...state.past, state.working], future: rest };
    }
    case "reset":
      return { working: action.working, past: [], future: [] };
  }
}

function Editor(props: {
  layoutId: string;
  name: string;
  view: ScreenView;
  serverBlocks: BlockLayout;
  hasDraft: boolean;
  inUse: boolean;
  eventOnScreen: boolean;
  readOnly?: boolean;
  run: (promise: Promise<unknown>, done?: string) => Promise<unknown>;
  onDeleted?: () => void;
}) {
  const { layoutId, view, serverBlocks, readOnly, run } = props;
  const [{ working, past, future }, dispatch] = useReducer(editReducer, {
    working: serverBlocks,
    past: [],
    future: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [previewData, setPreviewData] = useState<PreviewData>(props.eventOnScreen ? "event" : "demo");
  const [showBlocks, setShowBlocks] = useState(true);

  // Take the server's copy whenever we have nothing unsaved (another tab, a discard, a publish).
  const serverJson = JSON.stringify(serverBlocks);
  const workingJson = JSON.stringify(working);
  const dirty = serverJson !== workingJson;
  const lastServer = useRef(serverJson);
  useEffect(() => {
    if (serverJson === lastServer.current) return;
    lastServer.current = serverJson;
    if (saveState === "saved" || saveState === "blocked") dispatch({ type: "reset", working: JSON.parse(serverJson) as BlockLayout });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverJson]);

  const problems = useMemo(() => checkLayout(working, view), [working, view]);

  // Save the draft shortly after each change, if it has no errors.
  useEffect(() => {
    if (readOnly || !dirty) {
      if (!dirty) setSaveState("saved");
      return;
    }
    if (problems.errors.length) {
      setSaveState("blocked");
      return;
    }
    setSaveState("pending");
    const timer = setTimeout(() => {
      setSaveState("saving");
      run(sendKiosk("saveLayoutDraft", { layoutId, draft: working })).then(
        () => setSaveState("saved"),
        () => setSaveState("blocked"),
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingJson]);

  const change = useCallback(
    (next: BlockLayout | ((current: BlockLayout) => BlockLayout)) => {
      if (readOnly) return;
      dispatch({ type: "change", next: typeof next === "function" ? next : () => next });
    },
    [readOnly],
  );
  const undo = () => dispatch({ type: "undo" });
  const redo = () => dispatch({ type: "redo" });

  const add = (component: string) => {
    const result = edit.addBlock(working, kioskCatalog, component);
    if ("error" in result) {
      void run(Promise.reject(new Error(result.error))).catch(() => {});
      return;
    }
    change(result.layout);
    setSelected(result.blockId);
  };

  const selectedBlock = working.blocks.find((b) => b.id === selected) ?? null;
  const problemBlocks = new Set(
    working.blocks.filter((b) => problems.errors.some((e) => e.startsWith(kioskCatalog[b.component]?.name ?? b.component))).map((b) => b.id),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, select, textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (!selectedBlock || readOnly) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (step) {
      e.preventDefault();
      const [x, y] = step as [number, number];
      change((l) =>
        edit.nudgeBlock(l, kioskCatalog, selectedBlock.id, e.shiftKey ? { dw: x, dh: y } : { dx: x, dy: y }),
      );
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      change((l) => edit.removeBlock(l, selectedBlock.id));
      setSelected(null);
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  };

  const previewParams = new URLSearchParams({ preview: "", layout: layoutId, view });
  if (props.hasDraft || dirty) previewParams.set("draft", "");
  if (previewData !== "event") previewParams.set("sample", previewData);
  const previewUrl = `../graphics/kiosk.html?${previewParams.toString().replace(/=(?=&|$)/g, "")}`;

  return (
    <div className="editor" onKeyDown={onKeyDown}>
      <aside className="palette" aria-label="Components">
        <h2>Add to the screen</h2>
        {readOnly && <p className="muted">Built-in layouts can't be changed. Copy this one to make it yours.</p>}
        {Object.entries(CATEGORY_NAMES).map(([category, title]) => {
          const entries = Object.entries(kioskCatalog).filter(
            ([, e]) => e.category === category && e.placement === "block",
          );
          if (!entries.length) return null;
          return (
            <section key={category} className="palette__group">
              <h3>{title}</h3>
              {entries.map(([component, entry]) => {
                const placed = !entry.repeatable && working.blocks.some((b) => b.component === component);
                return (
                  <button
                    key={component}
                    type="button"
                    className="palette__item"
                    disabled={readOnly || placed}
                    title={entry.description}
                    onClick={() => add(component)}
                  >
                    <span>{entry.name}</span>
                    {placed && <span className="muted">On the layout</span>}
                  </button>
                );
              })}
            </section>
          );
        })}
      </aside>

      <section className="stagearea" aria-label="Layout">
        <div className="stagearea__bar">
          <div className="row">
            <button type="button" onClick={undo} disabled={readOnly || past.length === 0}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={readOnly || future.length === 0}>
              Redo
            </button>
            <label className="row toggle">
              <input type="checkbox" checked={showBlocks} onChange={(e) => setShowBlocks(e.target.checked)} />
              Show blocks
            </label>
          </div>
          <label className="row">
            <span className="muted">Preview with</span>
            <select value={previewData} onChange={(e) => setPreviewData(e.target.value as PreviewData)}>
              <option value="event" disabled={!props.eventOnScreen}>
                The event on screen{props.eventOnScreen ? "" : " (none)"}
              </option>
              <option value="demo">A sample show</option>
              <option value="worst">The longest text</option>
            </select>
          </label>
        </div>
        <Canvas
          layout={working}
          selected={selected}
          problemBlocks={problemBlocks}
          showBlocks={showBlocks}
          readOnly={Boolean(readOnly)}
          previewUrl={previewUrl}
          onSelect={setSelected}
          onChange={(items) => change((l) => edit.applyGrid(l, items))}
        />
        <p className="muted stagearea__hint">
          {readOnly
            ? `Built-in ${VIEW_NAMES[view]} layout.`
            : "Drag blocks to move them and their edges to resize. With a block selected: arrow keys move it, Shift+arrows resize, Delete removes it."}
        </p>
      </section>

      <aside className="inspector" aria-label="Details">
        <PublishBox
          {...props}
          saveState={saveState}
          dirty={dirty}
          errors={problems.errors}
          warnings={problems.warnings}
        />
        {selectedBlock ? (
          <BlockInspector
            key={selectedBlock.id}
            layout={working}
            blockId={selectedBlock.id}
            readOnly={Boolean(readOnly)}
            onChange={change}
            onRemove={() => {
              change((l) => edit.removeBlock(l, selectedBlock.id));
              setSelected(null);
            }}
          />
        ) : (
          <LayoutInspector layout={working} readOnly={Boolean(readOnly)} onChange={change} />
        )}
      </aside>
    </div>
  );
}

function Canvas(props: {
  layout: BlockLayout;
  selected: string | null;
  problemBlocks: Set<string>;
  showBlocks: boolean;
  readOnly: boolean;
  previewUrl: string;
  onSelect: (id: string | null) => void;
  onChange: (items: Layout) => void;
}) {
  const { layout } = props;
  const { width, containerRef, mounted } = useContainerWidth();
  const scale = width / STAGE_WIDTH;
  const cell = cellSize(layout);
  const compactor = useMemo(() => getCompactor(null, false, true), []);
  const items = layout.blocks.map((b) => {
    const min = edit.minCells(layout, kioskCatalog, b);
    return { i: b.id, x: b.x, y: b.y, w: b.w, h: b.h, minW: min.w, minH: min.h };
  });

  return (
    <div
      ref={containerRef}
      className={`canvas${props.showBlocks ? "" : " canvas--clean"}`}
      style={{ height: STAGE_HEIGHT * scale }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("react-grid-layout")) {
          props.onSelect(null);
        }
      }}
    >
      <iframe className="canvas__preview" src={props.previewUrl} title="Preview of this layout on a TV" tabIndex={-1} />
      {mounted && width > 0 && (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={{
            cols: 24,
            rowHeight: cell.height * scale,
            margin: [layout.gap * scale, layout.gap * scale],
            containerPadding: [layout.padding * scale, layout.padding * scale],
            maxRows: 24,
          }}
          dragConfig={{ enabled: !props.readOnly, bounded: true, threshold: 4 }}
          resizeConfig={{ enabled: !props.readOnly, handles: ["se", "e", "s", "w", "n", "sw", "ne", "nw"] }}
          compactor={compactor}
          autoSize={false}
          style={{ position: "absolute", inset: 0, height: STAGE_HEIGHT * scale }}
          onLayoutChange={props.onChange}
        >
          {layout.blocks.map((b) => {
            const entry = kioskCatalog[b.component];
            const classes = ["block"];
            if (props.selected === b.id) classes.push("is-selected");
            if (props.problemBlocks.has(b.id)) classes.push("has-problem");
            return (
              <div key={b.id} className={classes.join(" ")}>
                <button
                  type="button"
                  className="block__label"
                  onPointerDown={() => props.onSelect(b.id)}
                  onFocus={() => props.onSelect(b.id)}
                  aria-pressed={props.selected === b.id}
                >
                  {entry?.name ?? b.component}
                </button>
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}

function PublishBox(props: {
  layoutId: string;
  name: string;
  readOnly?: boolean;
  hasDraft: boolean;
  inUse: boolean;
  dirty: boolean;
  saveState: SaveState;
  errors: string[];
  warnings: string[];
  run: (promise: Promise<unknown>, done?: string) => Promise<unknown>;
  onDeleted?: () => void;
}) {
  const { readOnly, run, layoutId } = props;
  const status = readOnly
    ? "Built in"
    : props.saveState === "blocked"
      ? "Not saved: fix the problems below"
      : props.saveState !== "saved"
        ? "Saving…"
        : props.hasDraft
          ? "Draft saved. Screens still show the published version."
          : "Published. This is what screens show.";
  return (
    <section className="publish" aria-label="Publish">
      {!readOnly && <RenameLayout layoutId={layoutId} name={props.name} run={run} />}
      <p className={props.saveState === "blocked" ? "warning" : "muted"}>{status}</p>
      {!readOnly && (
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!props.hasDraft || props.dirty || props.errors.length > 0}
            onClick={() =>
              void run(sendKiosk("publishLayout", { layoutId }), props.inUse ? "Published. Screens using it now show the change." : "Published.").catch(
                () => {},
              )
            }
          >
            Publish
          </button>
          <ConfirmButton
            label="Discard changes"
            confirmLabel="Tap again to discard"
            disabled={!props.hasDraft && !props.dirty}
            onConfirm={() => void run(sendKiosk("discardLayoutDraft", { layoutId }), "Changes discarded.").catch(() => {})}
          />
          <ConfirmButton
            label="Delete"
            confirmLabel="Tap again to delete"
            disabled={props.inUse}
            onConfirm={() =>
              void run(sendKiosk("deleteLayout", { layoutId }), `Deleted "${props.name}".`).then(props.onDeleted, () => {})
            }
          />
        </div>
      )}
      {props.inUse && !readOnly && <p className="muted">It's on a screen, so it can't be deleted.</p>}
      {(props.errors.length > 0 || props.warnings.length > 0) && (
        <ul className="problems">
          {props.errors.map((p) => (
            <li key={p} className="problems__error">
              {p}
            </li>
          ))}
          {props.warnings.map((p) => (
            <li key={p} className="problems__warning">
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RenameLayout({ layoutId, name, run }: { layoutId: string; name: string; run: (p: Promise<unknown>, done?: string) => Promise<unknown> }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && value.trim() !== name) void run(sendKiosk("renameLayout", { layoutId, name: value.trim() }), "Renamed.").catch(() => {});
      }}
    >
      <label className="field">
        <span className="muted">Layout name</span>
        <input
          className="layout-title"
          maxLength={60}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </label>
    </form>
  );
}

function BlockInspector(props: {
  layout: BlockLayout;
  blockId: string;
  readOnly: boolean;
  onChange: (next: (current: BlockLayout) => BlockLayout) => void;
  onRemove: () => void;
}) {
  const block = props.layout.blocks.find((b) => b.id === props.blockId)!;
  const entry = kioskCatalog[block.component];
  if (!entry) return <p className="error">Unknown component "{block.component}".</p>;
  const variants = Object.keys(entry.variants);
  const variant = block.variant ?? variants[0]!;
  const px = edit.blockPixels(props.layout, block);
  const textScale = contentScale(entry.variants[variant], px);
  const fields = edit.settingFields(entry.settings);
  const set = (key: string, value: unknown) =>
    props.onChange((l) => edit.updateBlock(l, block.id, { settings: { ...block.settings, [key]: value } }));

  return (
    <section className="details" aria-label={entry.name}>
      <h2>{entry.name}</h2>
      <p className="muted">{entry.description}</p>
      <p>
        {px.width} × {px.height} px on the TV
        {textScale !== 1 && <span className="muted">, text at {Math.round(textScale * 100)}%</span>}
      </p>
      {variants.length > 1 && (
        <label className="field">
          <span>Style</span>
          <select
            value={variant}
            disabled={props.readOnly}
            onChange={(e) => props.onChange((l) => edit.updateBlock(l, block.id, { variant: e.target.value }))}
          >
            {variants.map((v) => (
              <option key={v} value={v}>
                {v[0]!.toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.map((field) => {
        const label = edit.SETTING_LABELS[field.key] ?? field.key;
        const value = block.settings[field.key] ?? field.fallback;
        if (field.kind === "text") {
          return (
            <label key={field.key} className="field">
              <span>{label}</span>
              <input
                value={String(value)}
                maxLength={field.maxLength}
                disabled={props.readOnly}
                onChange={(e) => set(field.key, e.target.value)}
              />
            </label>
          );
        }
        if (field.kind === "number") {
          return (
            <label key={field.key} className="field">
              <span>{label}</span>
              <input
                type="number"
                value={Number(value)}
                min={field.min}
                max={field.max}
                step={1}
                disabled={props.readOnly}
                onChange={(e) => e.target.value !== "" && set(field.key, Math.round(Number(e.target.value)))}
              />
            </label>
          );
        }
        return (
          <label key={field.key} className="row toggle">
            <input type="checkbox" checked={Boolean(value)} disabled={props.readOnly} onChange={(e) => set(field.key, e.target.checked)} />
            {label}
          </label>
        );
      })}
      {!props.readOnly && (
        <button type="button" onClick={props.onRemove}>
          Remove from layout
        </button>
      )}
    </section>
  );
}

function LayoutInspector(props: {
  layout: BlockLayout;
  readOnly: boolean;
  onChange: (next: (current: BlockLayout) => BlockLayout) => void;
}) {
  const { layout } = props;
  const toastsOn = layout.overlays.some((o) => o.component === "toasts");
  const number = (key: "gap" | "padding", label: string, max: number) => (
    <label className="field">
      <span>
        {label}: {layout[key]} px
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={4}
        value={layout[key]}
        disabled={props.readOnly}
        onChange={(e) => props.onChange((l) => ({ ...l, [key]: Number(e.target.value) }))}
      />
    </label>
  );
  return (
    <section className="details" aria-label="Whole layout">
      <h2>Whole layout</h2>
      <p className="muted">Select a block on the screen to change it.</p>
      {number("gap", "Space between blocks", 80)}
      {number("padding", "Space around the edge", 160)}
      <label className="row toggle">
        <input
          type="checkbox"
          checked={toastsOn}
          disabled={props.readOnly}
          onChange={(e) => props.onChange((l) => edit.setOverlay(l, "toasts", e.target.checked))}
        />
        Thank-you pop-ups when donations and bids come in
      </label>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<Builder />);
