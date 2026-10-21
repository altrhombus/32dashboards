import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmButton, errorText, useReplicant } from "@32dashboards/nodecg-react";
import type {
  ActiveEventIdReplicant,
  BidWar,
  DonationMoment,
  EventsReplicant,
  FundraiserEvent,
  LiveStateReplicant,
  MomentsReplicant,
  OutputsReplicant,
  RegisteredSourcesReplicant,
  SceneId,
  SceneReplicant,
  Screen,
  ScreensReplicant,
  ScreenView,
} from "@32dashboards/schema/core";
import { screenPresence } from "@32dashboards/schema/core";
import { formatAmount, formatTotal } from "@32dashboards/ui";
import "@32dashboards/nodecg-react/panel.css";
import "./live.css";
import { parseAmount } from "./amount.js";
import { send } from "./send.js";

/*
 * The live console: one screen for running the show. What's on the TV is
 * always marked with the red tally; every action is one tap and says what
 * it changed; actions that end the show take a second tap.
 */

/** Re-renders every `ms` so relative times stay fresh. */
function useNow(ms = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

interface Feedback {
  text: string;
  error?: boolean;
  undo?: () => void;
}

type Act = (promise: Promise<unknown>, done: string, undo?: () => void) => void;

// --- Status strip ---------------------------------------------------------

function TvStatus({ screens, outputs, now }: { screens: ScreensReplicant; outputs: OutputsReplicant; now: number }) {
  const { named, unnamed } = screenPresence(screens, outputs, now);
  const missing = named.filter((n) => !n.connected);
  const connected = named.length - missing.length + unnamed.length;
  const extra = unnamed.length > 0 && named.length > 0 ? `, plus ${unnamed.length} unnamed` : "";

  if (connected === 0 || missing.length > 0) {
    const what =
      named.length === 0
        ? "TV not connected"
        : missing.length === 1
          ? `${missing[0]!.screen.name} not connected`
          : `${missing.length} screens not connected`;
    return (
      <div className="status status--caution" role="status">
        <strong>{what}</strong>
        <span>
          {named.length > 1 ? `${named.length - missing.length} of ${named.length} screens connected${extra}. ` : ""}
          Open the kiosk on the TV laptop (Event-day runbook, step 3).
        </span>
      </div>
    );
  }
  const since = [...named.map((n) => n.since!), ...unnamed.map((u) => u.since)].sort()[0]!;
  return (
    <div className="status status--go" role="status">
      <strong>{connected > 1 ? `${connected} screens connected` : "TV connected"}</strong>
      <span>since {clock(since)}</span>
    </div>
  );
}

function SourceStatus({
  event,
  sources,
  now,
  act,
}: {
  event: FundraiserEvent;
  sources: RegisteredSourcesReplicant;
  now: number;
  act: Act;
}) {
  const adapterId = event.source.adapterId;
  if (!adapterId) {
    return (
      <div className="status status--caution">
        <strong>No data source</strong>
        <span>Pick one on the Event tab, in Events.</span>
      </div>
    );
  }
  const source = sources.find((s) => s.id === adapterId);
  if (!source) {
    return (
      <div className="status status--caution">
        <strong>{adapterId} isn't running</strong>
        <span>Restart NodeCG (Event-day runbook, troubleshooting).</span>
      </div>
    );
  }
  const failing = source.status.state === "error";
  return (
    <div className={`status ${failing ? "status--caution" : "status--go"}`}>
      <strong>
        {source.label}: {failing ? "needs a look" : "receiving data"}
      </strong>
      <span>{failing ? source.status.message : `Last data ${ago(source.lastResultAt, now)}`}</span>
      <button
        type="button"
        className="status__action"
        onClick={() => act(send("refreshSource", { eventId: event.id }), "Asked the source to fetch now.")}
      >
        Fetch now
      </button>
    </div>
  );
}

function EventSwitcher({ events, activeId, act }: { events: EventsReplicant; activeId: string | null; act: Act }) {
  const [choice, setChoice] = useState(activeId ?? "");
  useEffect(() => setChoice(activeId ?? ""), [activeId]);
  const changed = choice !== (activeId ?? "");
  const target = events.find((e) => e.id === choice);
  return (
    <div className="switcher">
      <select aria-label="Event on the TV" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">No event (standby screen)</option>
        {[...events]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
      </select>
      {changed && (
        <ConfirmButton
          className="primary"
          label={target ? "Put on TV" : "Take off TV"}
          confirmLabel="Tap again to switch the TV"
          onConfirm={() =>
            act(
              send("activateEvent", { eventId: choice || null }),
              target ? `${target.name} is on the TV.` : "The TV shows the standby screen.",
            )
          }
        />
      )}
    </div>
  );
}

// --- Preview and scenes -----------------------------------------------------

const SCENES: { id: SceneId; name: string; what: string }[] = [
  { id: "main", name: "Main", what: "Total, featured items, info bar" },
  { id: "intermission", name: "Intermission", what: "Your message and a countdown" },
  { id: "askMe", name: "Ask Me", what: "The Ask Me spotlight, full screen" },
  { id: "celebration", name: "Celebration", what: "Thank-you screen with the final total" },
];

function Scenes({ scene, act }: { scene: SceneReplicant; act: Act }) {
  const [message, setMessage] = useState("");
  const [minutes, setMinutes] = useState<number | null>(10);

  const go = (id: SceneId) => {
    const name = SCENES.find((s) => s.id === id)!.name;
    const payload =
      id === "intermission"
        ? {
            id,
            message: message.trim() || null,
            countdownTo: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
          }
        : { id };
    const previous = { id: scene.id, message: scene.message, countdownTo: scene.countdownTo };
    act(send("switchScene", payload), `${name} is on the TV.`, () => void send("switchScene", previous));
  };

  return (
    <section className="scenes" aria-label="Scenes">
      {SCENES.map((s) => {
        const onAir = s.id === scene.id;
        const content = (
          <>
            <span className="scene__name">{s.name}</span>
            <span className="scene__what">{onAir ? `On TV since ${clock(scene.changedAt)}` : s.what}</span>
          </>
        );
        if (s.id === "celebration" && !onAir) {
          return (
            <ConfirmButton
              key={s.id}
              className="scene"
              label={content}
              confirmLabel="Tap again to end with the celebration"
              onConfirm={() => go(s.id)}
            />
          );
        }
        return (
          <button
            key={s.id}
            type="button"
            className={`scene${onAir ? " scene--on-air" : ""}`}
            aria-pressed={onAir}
            onClick={() => go(s.id)}
          >
            {content}
          </button>
        );
      })}
      <div className="intermission-options">
        <input
          aria-label="Intermission message"
          placeholder="Intermission message, e.g. Dinner is served!"
          maxLength={160}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Intermission countdown">
          {[null, 5, 10, 15, 30].map((m) => (
            <button
              key={m ?? "none"}
              type="button"
              aria-pressed={minutes === m}
              className="chip"
              onClick={() => setMinutes(m)}
            >
              {m ? `${m} min` : "No countdown"}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- Money in the room --------------------------------------------------------

const VENUE_AMOUNTS = [20, 50, 100, 500];

// --- Screens ---------------------------------------------------------------

/** What the console needs from layout-kiosk's `layouts` Replicant (read by name, so core doesn't depend on that bundle). */
interface LayoutSummary {
  id: string;
  name: string;
  view: string;
}

const PREVIEW_SCREEN_KEY = "32dashboards.live.previewScreen";

/** Mid-show, change which finished layout a screen shows for what's on air. Building layouts happens in the Layouts tab. */
function ScreenLayouts(props: {
  screens: ScreensReplicant;
  layouts: LayoutSummary[];
  view: ScreenView;
  connected: Set<string>;
  act: Act;
}) {
  const { screens, layouts, view, act } = props;
  if (screens.length === 0) return null;
  const forView = layouts.filter((l) => l.view === view);
  const others = layouts.filter((l) => l.view !== view);
  const viewName = view === "standby" ? "standby" : SCENES.find((s) => s.id === view)?.name;
  const choose = (screen: Screen, ref: string) => {
    const before = screen.layouts;
    const layouts = { ...before };
    if (ref) layouts[view] = ref;
    else delete layouts[view];
    const name = ref ? (props.layouts.find((l) => l.id === ref)?.name ?? "the chosen layout") : "the built-in layout";
    act(
      send("saveScreen", { ...screen, layouts }),
      `${screen.name} now shows ${name}.`,
      () => void send("saveScreen", { ...screen, layouts: before }),
    );
  };
  return (
    <section className="screen-layouts" aria-label="Layouts on each screen">
      <h2>On each screen now ({viewName})</h2>
      {screens.map((screen) => (
        <label key={screen.id} className="screen-layout">
          <span className={`dot ${props.connected.has(screen.id) ? "dot--go" : "dot--caution"}`} aria-hidden="true" />
          <span className="screen-layout__name">{screen.name}</span>
          <select value={screen.layouts[view] ?? ""} onChange={(e) => choose(screen, e.target.value)}>
            <option value="">Built-in</option>
            {forView.length > 0 && (
              <optgroup label={`Made for ${viewName}`}>
                {forView.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Others">
                {others.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      ))}
    </section>
  );
}

/** A typed-in amount beside the preset buttons ("Other amount" + Add). */
function AmountForm({ label, onAdd, compact }: { label: string; onAdd: (amount: number) => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const amount = parseAmount(text);
  return (
    <form
      className={`row amount-form${compact ? " amount-form--compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (amount === null) return;
        onAdd(amount);
        setText("");
      }}
    >
      <input
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={label}
        placeholder={compact ? "$" : "Other amount"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="primary" disabled={amount === null}>
        Add
      </button>
    </form>
  );
}

function Money({
  live,
  event,
  sourceLabel,
  act,
}: {
  live: LiveStateReplicant;
  event: FundraiserEvent;
  sourceLabel: string;
  act: Act;
}) {
  const [correction, setCorrection] = useState("");
  const corrected = Number(correction);
  const correctionValid = correction.trim() !== "" && Number.isFinite(corrected);

  const add = (delta: number) =>
    act(
      send("nudgeAdjustment", { eventId: event.id, delta }),
      `Added ${formatAmount(delta)} from the venue.`,
      () => void send("nudgeAdjustment", { eventId: event.id, delta: -delta }),
    );

  return (
    <section className="money" aria-label="Money in the room">
      <div className="money__total">
        <span className="money__amount">{formatTotal(live.total)}</span>
        <span className="muted">
          {formatTotal(live.rawTotal)} from {sourceLabel} and {formatAmount(live.adjustment)} at the venue
        </span>
      </div>
      <div className="money__add">
        <span className="money__label">Add cash or checks taken at the venue</span>
        <div className="chips">
          {VENUE_AMOUNTS.map((a) => (
            <button key={a} type="button" className="chip chip--money" onClick={() => add(a)}>
              +{formatAmount(a)}
            </button>
          ))}
        </div>
        <AmountForm label="Other venue amount" onAdd={add} />
      </div>
      <details>
        <summary className="muted">Correct the venue total</summary>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!correctionValid) return;
            const previous = live.adjustment;
            act(
              send("setAdjustment", { eventId: event.id, amount: corrected }),
              `Venue total set to ${formatAmount(corrected)}.`,
              () => void send("setAdjustment", { eventId: event.id, amount: previous }),
            );
            setCorrection("");
          }}
        >
          <input
            inputMode="decimal"
            aria-label="Venue total"
            placeholder={formatAmount(live.adjustment)}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
          />
          <button type="submit" disabled={!correctionValid}>
            Set venue total
          </button>
        </form>
        <p className="muted">Corrections don't show a thank-you on the TV.</p>
      </details>
    </section>
  );
}

function AskMeTotal({ event, act }: { event: FundraiserEvent; act: Act }) {
  const add = (delta: number) =>
    act(
      send("nudgeAskMe", { eventId: event.id, delta }),
      `Added ${formatAmount(delta)} to Ask Me.`,
      () => void send("nudgeAskMe", { eventId: event.id, delta: -delta }),
    );
  return (
    <section className="block" aria-label="Ask Me total">
      <h2>Ask Me total: {formatAmount(event.askMe.total)}</h2>
      <div className="chips">
        {[10, 25, 50, 100, 250].map((d) => (
          <button key={d} type="button" className="chip chip--money" onClick={() => add(d)}>
            +{formatAmount(d)}
          </button>
        ))}
      </div>
      <AmountForm label="Other Ask Me amount" onAdd={add} />
    </section>
  );
}

function BidWars({ event, act }: { event: FundraiserEvent; act: Act }) {
  const wars = event.bidWars.filter((w) => w.active && w.options.length > 0);
  if (wars.length === 0) return null;
  const nudge = (war: BidWar, optionId: string, name: string, delta: number) =>
    act(
      send("nudgeBidWar", { eventId: event.id, bidWarId: war.id, optionId, delta }),
      `${delta > 0 ? "Added" : "Took"} ${formatAmount(Math.abs(delta))} ${delta > 0 ? "to" : "from"} ${name}.`,
      () => void send("nudgeBidWar", { eventId: event.id, bidWarId: war.id, optionId, delta: -delta }),
    );
  return (
    <section className="block" aria-label="Bid wars">
      <h2>Bid wars</h2>
      {wars.map((war) => (
        <div key={war.id} className="war">
          <span className="war__name">{war.name}</span>
          {war.options.map((o) => (
            <div key={o.id} className="war__option">
              <span className="war__option-name">{o.name}</span>
              <span className="war__total">{formatAmount(o.total)}</span>
              <span className="chips">
                {[5, 25, 100].map((d) => (
                  <button key={d} type="button" className="chip" onClick={() => nudge(war, o.id, o.name, d)}>
                    +{d}
                  </button>
                ))}
              </span>
              <AmountForm compact label={`Other amount for ${o.name}`} onAdd={(d) => nudge(war, o.id, o.name, d)} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function Incentives({ event, total, act }: { event: FundraiserEvent; total: number; act: Act }) {
  const active = event.incentives.filter((i) => i.active);
  if (active.length === 0) return null;
  const pin = (id: string | null) => {
    const incentives = event.incentives.map((i) => ({ ...i, displayNow: i.id === id }));
    const name = active.find((i) => i.id === id)?.name;
    act(
      send("updateEvent", { eventId: event.id, patch: { incentives } }),
      name ? `${name} is pinned to the info bar.` : "Info bar is rotating again.",
    );
  };
  return (
    <section className="block" aria-label="Incentives">
      <h2>Incentives</h2>
      {active.map((i) => {
        const pct = i.target > 0 ? Math.min(100, Math.round((total / i.target) * 100)) : 0;
        return (
          <div key={i.id} className="incentive">
            <div className="incentive__text">
              <span className="incentive__name">{i.name}</span>
              <span className="muted">
                {formatTotal(total)} of {formatAmount(i.target)} ({pct}%)
              </span>
            </div>
            <button
              type="button"
              aria-pressed={i.displayNow}
              className="chip"
              onClick={() => pin(i.displayNow ? null : i.id)}
            >
              {i.displayNow ? "Unpin" : "Pin to info bar"}
            </button>
          </div>
        );
      })}
    </section>
  );
}

function describeMoment(m: DonationMoment): string {
  switch (m.kind) {
    case "total-increase":
      return `${formatAmount(m.delta)} came in`;
    case "new-bid":
      return `New bid on ${m.itemTitle}${m.amount !== null ? `: ${formatAmount(m.amount)}` : ""}`;
    case "milestone":
      return `Milestone ${formatAmount(m.amount)} reached${m.label ? `: ${m.label}` : ""}`;
    case "incentive-met":
      return `Incentive met: ${m.name}`;
  }
}

function Moments({ moments }: { moments: MomentsReplicant }) {
  return (
    <section className="block moments" aria-label="Recent moments">
      <h2>What the TV celebrated</h2>
      {moments.length === 0 ? (
        <p className="muted">Donations, bids, and milestones show up here as they happen.</p>
      ) : (
        <ol className="moments__list">
          {[...moments].reverse().map((m) => (
            <li key={m.id} className={`moment moment--${m.kind}`}>
              <time dateTime={m.at}>{clock(m.at)}</time>
              <span>{describeMoment(m)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// --- Console ------------------------------------------------------------------

function Console() {
  const events = useReplicant<EventsReplicant>("events");
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId") ?? null;
  const live = useReplicant<LiveStateReplicant>("liveState");
  const scene = useReplicant<SceneReplicant>("scene");
  const sources = useReplicant<RegisteredSourcesReplicant>("sources") ?? [];
  const outputs = useReplicant<OutputsReplicant>("outputs") ?? [];
  const screens = useReplicant<ScreensReplicant>("screens") ?? [];
  const moments = useReplicant<MomentsReplicant>("moments") ?? [];
  const layouts = useReplicant<LayoutSummary[]>("layouts", "layout-kiosk") ?? [];
  const now = useNow();
  const [previewScreen, setPreviewScreen] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_SCREEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const act: Act = (promise, done, undo) => {
    clearTimeout(feedbackTimer.current);
    promise.then(
      () => {
        setFeedback({ text: done, undo });
        feedbackTimer.current = setTimeout(() => setFeedback(null), 10_000);
      },
      (err) => setFeedback({ text: errorText(err), error: true }),
    );
  };

  if (!events || !live || !scene) return <p className="console-loading">Connecting to NodeCG…</p>;
  const event = live.event;
  const view: ScreenView = event ? scene.id : "standby";
  const shownScreen = screens.find((s) => s.id === previewScreen);
  const connected = new Set(
    screenPresence(screens, outputs, now)
      .named.filter((n) => n.connected)
      .map((n) => n.screen.id),
  );
  const pickPreview = (id: string) => {
    setPreviewScreen(id);
    try {
      localStorage.setItem(PREVIEW_SCREEN_KEY, id);
    } catch {
      // Without storage the choice lasts until reload.
    }
  };

  return (
    <div className="console">
      <header className="strip">
        <EventSwitcher events={events} activeId={activeId} act={act} />
        <TvStatus screens={screens} outputs={outputs} now={now} />
        {event && <SourceStatus event={event} sources={sources} now={now} act={act} />}
      </header>

      <div className="stage">
        <figure className="preview">
          <div className="preview__frame">
            <iframe
              title="What the TV shows"
              src={`/bundles/layout-kiosk/graphics/kiosk.html?preview${shownScreen ? `&screen=${shownScreen.id}` : ""}`}
              tabIndex={-1}
            />
          </div>
          <figcaption>
            <span className="badge">On TV</span> {event ? event.name : "Standby screen (no event)"}
            {screens.length > 0 && (
              <label className="preview__screen">
                <span className="muted">Preview shows</span>
                <select value={shownScreen?.id ?? ""} onChange={(e) => pickPreview(e.target.value)}>
                  <option value="">Built-in layouts</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </figcaption>
        </figure>
        <div className="stage__side">
          <Scenes scene={scene} act={act} />
          <ScreenLayouts screens={screens} layouts={layouts} view={view} connected={connected} act={act} />
        </div>
      </div>

      {event ? (
        <div className="desk">
          <div className="desk__main">
            {scene.id === "askMe" && <AskMeTotal event={event} act={act} />}
            <Money
              live={live}
              event={event}
              sourceLabel={sources.find((s) => s.id === live.sourceId)?.label ?? live.sourceId ?? "the source"}
              act={act}
            />
            <BidWars event={event} act={act} />
            <Incentives event={event} total={live.total} act={act} />
          </div>
          <Moments moments={moments} />
        </div>
      ) : (
        <p className="empty">Pick an event above and put it on the TV to start taking donations.</p>
      )}

      <div
        className={`feedback${feedback ? " feedback--shown" : ""}${feedback?.error ? " feedback--error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {feedback && (
          <>
            <span>{feedback.text}</span>
            {feedback.undo && (
              <button
                type="button"
                onClick={() => {
                  feedback.undo?.();
                  setFeedback({ text: "Undone." });
                }}
              >
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Console />);
