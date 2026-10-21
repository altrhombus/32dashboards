import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ColorFields,
  ConfirmButton,
  FontPicker,
  PaletteSwatches,
  errorText,
  uploadAsset,
  useLogoColors,
  useReplicant,
} from "@32dashboards/nodecg-react";
import {
  screenPresence,
  type ActiveEventIdReplicant,
  type EventTheme,
  type EventsReplicant,
  type FundraiserEvent,
  type OutputsReplicant,
  type ScreensReplicant,
  type SourceResultsReplicant,
} from "@32dashboards/schema/core";
import { ConfettiBurst, validateTheme } from "@32dashboards/ui";
import "@32dashboards/nodecg-react/panel.css";
import "@32dashboards/nodecg-react/look.css";
import "@32dashboards/ui/fonts.css";
import "./setup.css";
import { send } from "./send.js";
import { STEPS, isoToLocalInput, localInputToIso, milestoneAmounts, type StepId } from "./setupPlan.js";

/*
 * New event: a guided setup for someone who hasn't done this before. A live
 * TV preview of the event sits beside each question and fills in as it's
 * answered. Every step after Start can be skipped, and the result is an
 * ordinary event, editable on the Event tab like any other.
 */

const AUCTIONS = "source-32auctions";
const PROGRESS_KEY = "32dashboards.setup";
const id = () => crypto.randomUUID();

interface Progress {
  eventId: string | null;
  step: StepId;
}

const readProgress = (): Progress => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null") as Progress | null;
    if (saved && STEPS.some((s) => s.id === saved.step)) return saved;
  } catch {
    // Storage can be unavailable or hold something else; start over.
  }
  return { eventId: null, step: "start" };
};

const writeProgress = (progress: Progress) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Without storage the guide just can't resume after a reload.
  }
};

interface AuctionLookup {
  friendlyAuctionPath: string;
  orgId: string;
  auctionId: string;
  title: string | null;
  organizationName: string | null;
  logoUrl: string | null;
}

interface ConnectionTest {
  itemCount: number;
  photoCount: number;
  total: "visible" | "from-bids" | "not-shown";
  samples: { title: string; imageUrl: string | null }[];
}

type Update = (patch: Parameters<typeof send<"updateEvent">>[1]["patch"], note?: string) => Promise<void>;

function goTo(hash: string) {
  window.top!.location.hash = hash;
}

function Setup() {
  const events = useReplicant<EventsReplicant>("events");
  const activeId = useReplicant<ActiveEventIdReplicant>("activeEventId") ?? null;
  const [progress, setProgressState] = useState<Progress>(readProgress);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [changed, setChanged] = useState<{ text: string; n: number } | null>(null);

  const setProgress = (next: Progress) => {
    setProgressState(next);
    writeProgress(next);
  };
  const event = events?.find((e) => e.id === progress.eventId) ?? null;

  // A saved event that was deleted elsewhere: start over.
  useEffect(() => {
    if (events && progress.eventId && !event) setProgress({ eventId: null, step: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, progress.eventId]);

  if (!events) return <p className="setup-loading">Connecting…</p>;

  const fail = (err: unknown) => setNote({ text: errorText(err), error: true });
  /** Shows what just changed on the TV, beside the preview. */
  const announce = (text: string) => setChanged((c) => ({ text, n: (c?.n ?? 0) + 1 }));
  const update: Update = async (patch, changedNote) => {
    if (!event) return;
    setNote(null);
    try {
      await send("updateEvent", { eventId: event.id, patch });
      if (changedNote) announce(changedNote);
    } catch (err) {
      fail(err);
      throw err;
    }
  };
  const index = STEPS.findIndex((s) => s.id === progress.step);
  const go = (step: StepId) => setProgress({ ...progress, step });
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)]!.id);
  const back = () => go(STEPS[Math.max(index - 1, 0)]!.id);

  const step = (() => {
    switch (progress.step) {
      case "start":
        return (
          <StartStep
            events={events}
            current={event}
            onStarted={(eventId, text) => {
              setProgress({ eventId, step: "name" });
              announce(text);
            }}
            onFail={fail}
          />
        );
      case "name":
        return event && <NameStep event={event} update={update} />;
      case "money":
        return event && <MoneyStep event={event} update={update} onFail={fail} announce={announce} />;
      case "look":
        return event && <LookStep event={event} update={update} onFail={fail} />;
      case "celebrate":
        return event && <CelebrateStep event={event} update={update} />;
      case "extras":
        return event && <ExtrasStep event={event} update={update} />;
      case "ready":
        return (
          event && <ReadyStep event={event} activeId={activeId} events={events} onFail={fail} announce={announce} />
        );
    }
  })();

  return (
    <div className="setup">
      <header className="setup__top">
        <ol className="rail" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="rail__step"
                aria-current={s.id === progress.step ? "step" : undefined}
                data-done={i < index || undefined}
                disabled={!event && s.id !== "start"}
                onClick={() => go(s.id)}
              >
                <span className="rail__n">{i + 1}</span>
                <span className="rail__label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="setup__skip" onClick={() => goTo("workspace/event")}>
          Skip the guide
        </button>
      </header>

      <div className="setup__body">
        <section className="card" aria-live="polite">
          {step}
          {note && <p className={note.error ? "error" : "status-ok"}>{note.text}</p>}
          {progress.step !== "start" && progress.step !== "ready" && (
            <footer className="card__nav">
              <button type="button" onClick={back}>
                Back
              </button>
              <span className="grow" />
              <button type="button" className="primary card__next" onClick={next}>
                {progress.step === "extras" ? "Almost done" : "Continue"}
              </button>
            </footer>
          )}
        </section>
        <Preview eventId={event?.id ?? null} changed={changed} />
      </div>
    </div>
  );
}

/** The TV as it will look, beside every step, with a note about what just changed. */
function Preview({ eventId, changed }: { eventId: string | null; changed: { text: string; n: number } | null }) {
  const params = new URLSearchParams({ view: eventId ? "main" : "standby" });
  if (eventId) params.set("event", eventId);
  return (
    <figure className="tv">
      <div key={changed?.n ?? 0} className={`tv__frame${changed ? " tv__frame--changed" : ""}`}>
        <iframe
          title="Your event on the TV"
          src={`/bundles/layout-kiosk/graphics/kiosk.html?preview&${params}`}
          tabIndex={-1}
        />
      </div>
      <figcaption>
        {changed ? (
          <span key={changed.n} className="tv__changed">
            {/* A "!" note is a whole sentence of its own. */}
            {changed.text.startsWith("!") ? changed.text.slice(1) : `Now on the TV: ${changed.text}`}
          </span>
        ) : (
          <span className="muted">Your TV, as you set it up</span>
        )}
      </figcaption>
    </figure>
  );
}

function Question({ title, children, lead }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <h1 className="card__title">{title}</h1>
      {lead && <p className="card__lead">{lead}</p>}
      <div className="card__fields">{children}</div>
    </>
  );
}

// --- 1. Start -----------------------------------------------------------------

function StartStep(props: {
  events: FundraiserEvent[];
  current: FundraiserEvent | null;
  onStarted: (eventId: string, changed: string) => void;
  onFail: (err: unknown) => void;
}) {
  const [link, setLink] = useState("");
  const [found, setFound] = useState<AuctionLookup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const recent = [...props.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lookUp = async () => {
    setBusy("Looking up your auction…");
    setFound(null);
    try {
      setFound((await nodecg.sendMessageToBundle("lookupAuction", AUCTIONS, { url: link })) as AuctionLookup);
    } catch (err) {
      props.onFail(err);
    } finally {
      setBusy(null);
    }
  };

  /** Creates the event (fresh or copied), then fills in what the auction told us. */
  const start = async (from: { auction?: AuctionLookup; copyOf?: string }) => {
    setBusy("Setting up your event…");
    try {
      const { auction, copyOf } = from;
      const name = auction?.title?.slice(0, 200) || "New event";
      const eventId = copyOf
        ? ((await send("duplicateEvent", { eventId: copyOf })) as string)
        : ((await send("createEvent", { name, causeName: auction?.organizationName ?? undefined })) as string);
      if (copyOf && auction?.title) await send("updateEvent", { eventId, patch: { name } });
      if (auction) {
        await send("updateEvent", { eventId, patch: { source: { adapterId: "32auctions" } } });
        await nodecg.sendMessageToBundle("setConfig", AUCTIONS, {
          eventId,
          config: {
            orgId: auction.orgId,
            auctionId: auction.auctionId,
            friendlyAuctionPath: auction.friendlyAuctionPath,
            refreshIntervalSeconds: 10,
            totalFrom: "page",
          },
        });
        if (auction.logoUrl && !copyOf) {
          // The organization's logo, copied in; the Look step suggests colors from it.
          const logoUrl = (await send("importAsset", {
            category: "event-logos",
            url: auction.logoUrl,
            name: auction.organizationName ?? auction.title ?? "logo",
          }).catch(() => null)) as string | null;
          if (logoUrl) await send("updateEvent", { eventId, patch: { theme: { logoUrl } } });
        }
      } else if (!copyOf) {
        await send("updateEvent", { eventId, patch: { source: { adapterId: "manual" } } });
      }
      props.onStarted(
        eventId,
        auction ? "your auction's name and logo" : copyOf ? "your copied event" : "your new event",
      );
    } catch (err) {
      props.onFail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Question
      title="Let's set up your event"
      lead="Paste the link to your 32auctions auction, the one you share with bidders, and we'll fill in what we can."
    >
      {props.current && (
        <p className="resume">
          You were setting up <strong>{props.current.name}</strong>. Pick a step above to carry on, or start another
          event below.
        </p>
      )}
      <form
        className="row link-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) void lookUp();
        }}
      >
        <input
          className="grow big-input"
          aria-label="32auctions link"
          placeholder="32auctions.com/YourAuction"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          autoFocus
        />
        <button type="submit" className="primary" disabled={!link.trim() || Boolean(busy)}>
          Find it
        </button>
      </form>

      {found && (
        <div className="found">
          {found.logoUrl && <img className="found__logo" src={found.logoUrl} alt="" />}
          <div className="found__text">
            <strong>{found.title ?? found.friendlyAuctionPath}</strong>
            {found.organizationName && <span className="muted">{found.organizationName}</span>}
          </div>
          <button
            type="button"
            className="primary"
            disabled={Boolean(busy)}
            onClick={() => void start({ auction: found, copyOf: copyFrom || undefined })}
          >
            That's the one
          </button>
        </div>
      )}
      {busy && <p className="muted">{busy}</p>}

      {recent.length > 0 && (
        <label className="field">
          <span className="muted">Copy an earlier event's look, goals and sponsors (optional)</span>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Start fresh</option>
            {recent.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="linkish"
        disabled={Boolean(busy)}
        onClick={() => void start({ copyOf: copyFrom || undefined })}
      >
        No 32auctions auction? Set up an event without one
      </button>
    </Question>
  );
}

// --- 2. Name -------------------------------------------------------------------

/** A text field that saves itself shortly after typing stops. */
function useAutosave<T>(value: T, save: (value: T) => void, delay = 600) {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  const json = JSON.stringify(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => saveRef.current(JSON.parse(json) as T), delay);
    return () => clearTimeout(timer);
  }, [json, delay]);
}

function NameStep({ event, update }: { event: FundraiserEvent; update: Update }) {
  const [name, setName] = useState(event.name);
  const [cause, setCause] = useState(event.causeName);
  const [end, setEnd] = useState(isoToLocalInput(event.endDateTime));
  useAutosave(name, (v) => v.trim() && void update({ name: v.trim() }, "the event's name").catch(() => {}));
  useAutosave(cause, (v) => void update({ causeName: v.trim() }, "what it's raising money for").catch(() => {}));
  useAutosave(end, (v) => {
    const iso = localInputToIso(v);
    if (iso) void update({ endDateTime: iso }, "the countdown").catch(() => {});
  });
  return (
    <Question title="What's it called?" lead="These show on every screen. Change them any time.">
      <label className="field">
        <span>Event name</span>
        <input className="big-input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Raising money for</span>
        <input
          maxLength={200}
          placeholder="e.g. Riverside Animal Shelter"
          value={cause}
          onChange={(e) => setCause(e.target.value)}
        />
      </label>
      <label className="field">
        <span>When bidding closes</span>
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        <span className="muted">The Main screen counts down to it.</span>
      </label>
    </Question>
  );
}

// --- 3. Money ------------------------------------------------------------------

function MoneyStep(props: {
  event: FundraiserEvent;
  update: Update;
  onFail: (err: unknown) => void;
  announce: (text: string) => void;
}) {
  const { event } = props;
  const configs = useReplicant<Record<string, { totalFrom?: string }>>("configs", AUCTIONS);
  const secretStatus = useReplicant<Record<string, string[]>>("secretStatus", AUCTIONS) ?? {};
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [test, setTest] = useState<ConnectionTest | null>(null);
  const [busy, setBusy] = useState(false);

  if (event.source.adapterId !== "32auctions") {
    return (
      <Question
        title="Money comes in by hand"
        lead="There's no auction site for this event, so you'll add amounts during the show from the Live tab: cash and checks, Ask Me pledges, and bid war votes. Nothing to set up here."
      />
    );
  }
  const config = configs?.[event.id];
  const signedInSaved = (secretStatus[event.id] ?? []).includes("password");
  const totalFrom = config?.totalFrom ?? "page";

  const setTotalFrom = (value: string) =>
    void nodecg
      .sendMessageToBundle("setConfig", AUCTIONS, { eventId: event.id, config: { ...config, totalFrom: value } })
      .catch(props.onFail);

  const connect = async () => {
    setBusy(true);
    setTest(null);
    try {
      if (email.trim())
        await nodecg.sendMessageToBundle("setSecret", AUCTIONS, {
          eventId: event.id,
          key: "email",
          value: email.trim(),
        });
      if (password)
        await nodecg.sendMessageToBundle("setSecret", AUCTIONS, {
          eventId: event.id,
          key: "password",
          value: password,
        });
      setPassword("");
      const result = (await nodecg.sendMessageToBundle("testConnection", AUCTIONS, {
        eventId: event.id,
      })) as ConnectionTest;
      setTest(result);
      props.announce(`${result.itemCount} auction items`);
    } catch (err) {
      props.onFail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Question
      title="Connect your auction"
      lead="The TVs show your items, photos and bids, and the total raised. 32auctions shows the total only to the organizer, so sign in with that account."
    >
      <fieldset className="choices">
        <legend className="muted">Where the total comes from</legend>
        {[
          ["page", "32auctions' total", "Needs the organizer sign-in below."],
          ["bids", "Add up the current bids", "No sign-in needed; leaves out donations."],
          ["none", "Don't show the auction's total", "Only cash and pledges added at the venue."],
        ].map(([value, label, hint]) => (
          <label key={value} className="choice">
            <input type="radio" name="totalFrom" checked={totalFrom === value} onChange={() => setTotalFrom(value!)} />
            <span>
              <strong>{label}</strong> <span className="muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {totalFrom === "page" && (
        <div className="signin">
          <label className="field">
            <span>Organizer email {signedInSaved && <span className="badge-ok">saved</span>}</span>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={signedInSaved ? "Saved; type to change it" : ""}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signedInSaved ? "Saved; type to change it" : ""}
            />
          </label>
          <p className="muted">
            Stored only on this laptop, never shown again. The guide signs in again by itself whenever the session runs
            out.
          </p>
        </div>
      )}

      <button
        type="button"
        className="primary big-button"
        disabled={busy || (totalFrom === "page" && !signedInSaved && !(email && password))}
        onClick={() => void connect()}
      >
        {busy ? "Connecting…" : "Connect and check"}
      </button>

      {test && (
        <div className="test">
          <p className="status-ok">
            Connected: <strong>{test.itemCount} items</strong>,{" "}
            {test.photoCount === test.itemCount ? "all with photos" : `${test.photoCount} with photos`}
            {test.total === "visible" ? ", and the total comes through." : "."}
          </p>
          <div className="filmstrip" aria-label="Some of your items">
            {test.samples.map((s, i) => (
              <figure key={i} style={{ animationDelay: `${i * 70}ms` }}>
                {s.imageUrl && <img src={s.imageUrl} alt="" loading="lazy" />}
                <figcaption className="clamp-1">{s.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </Question>
  );
}

// --- 4. Look -------------------------------------------------------------------

function LookStep(props: { event: FundraiserEvent; update: Update; onFail: (err: unknown) => void }) {
  const { event, update } = props;
  const [theme, setTheme] = useState<EventTheme>(event.theme);
  const [uploading, setUploading] = useState<string | null>(null);
  const fromLogo = useLogoColors(theme.logoUrl);
  const applied = useRef(false);

  const save = (patch: Partial<EventTheme>, changed: string) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    if (!validateTheme(next).some((i) => i.level === "error")) void update({ theme: next }, changed).catch(() => {});
  };

  // The first time the logo suggests colors, use them: the surprise is seeing your own colors on the TV.
  useEffect(() => {
    if (!fromLogo || applied.current) return;
    applied.current = true;
    const usingDefault = validateTheme(theme).length === 0 && theme.accentColor === "#ebc81e";
    if (usingDefault) save(fromLogo.colors, "colors from your logo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLogo]);

  return (
    <Question
      title="Make it yours"
      lead={
        fromLogo
          ? "We picked these colors from your logo. Keep them, try another set, or fine-tune."
          : "Add your logo and pick colors. Every set here is easy to read from across the room."
      }
    >
      <div className="logo-row">
        {theme.logoUrl ? (
          <img className="logo-row__img" src={theme.logoUrl} alt="Your logo" />
        ) : (
          <span className="logo-row__none">No logo yet</span>
        )}
        <label className="upload">
          <span>{uploading ?? (theme.logoUrl ? "Use a different logo" : "Upload your logo")}</span>
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
                  applied.current = false;
                  save({ logoUrl }, "your logo");
                },
                (err) => {
                  setUploading(null);
                  props.onFail(err);
                },
              );
            }}
          />
        </label>
      </div>
      <PaletteSwatches theme={theme} suggested={fromLogo} onPick={(colors) => save(colors, "new colors")} />
      <details className="section">
        <summary>Fine-tune the colors</summary>
        <ColorFields theme={theme} onChange={(patch) => save(patch, "new colors")} />
      </details>
      <FontPicker
        title="Words"
        kind="display"
        sample={event.name}
        value={theme.fontDisplay}
        onChange={(fontDisplay) => save({ fontDisplay }, "a new font")}
      />
      <FontPicker
        title="Numbers"
        kind="numbers"
        sample="$12,480"
        value={theme.fontMono}
        onChange={(fontMono) => save({ fontMono }, "a new number font")}
      />
    </Question>
  );
}

// --- 5. Celebrations -------------------------------------------------------------

function CelebrateStep({ event, update }: { event: FundraiserEvent; update: Update }) {
  const [every, setEvery] = useState(1000);
  const [upTo, setUpTo] = useState(20000);
  const [goalName, setGoalName] = useState(event.incentives[0]?.name ?? "");
  const [goalTarget, setGoalTarget] = useState(event.incentives[0]?.target ?? 0);
  const amounts = milestoneAmounts(every, upTo);

  return (
    <Question title="When should the room cheer?" lead="Each time the total passes one of these, the TVs celebrate.">
      <div className="row cheer">
        <span>Celebrate every</span>
        <input
          type="number"
          min={100}
          step={100}
          value={every}
          onChange={(e) => setEvery(Number(e.target.value))}
          aria-label="Celebrate every (dollars)"
        />
        <span>up to</span>
        <input
          type="number"
          min={every}
          step={1000}
          value={upTo}
          onChange={(e) => setUpTo(Number(e.target.value))}
          aria-label="Up to (dollars)"
        />
        <button
          type="button"
          className="primary"
          disabled={amounts.length === 0}
          onClick={() =>
            void update(
              {
                milestones: amounts.map((amount) => ({
                  id: id(),
                  amount,
                  label: event.milestones.find((m) => m.amount === amount)?.label ?? "",
                })),
              },
              `${amounts.length} celebrations`,
            ).catch(() => {})
          }
        >
          {event.milestones.length ? "Replace celebrations" : "Set them"}
        </button>
      </div>
      <p className="muted">
        {event.milestones.length
          ? `Now: ${event.milestones.length} celebrations, from $${event.milestones[0]!.amount.toLocaleString()}.`
          : "None yet."}{" "}
        Name a special one (like "$10,000: a new puppy play yard") on the Event tab.
      </p>

      <h2 className="card__sub">A big goal (optional)</h2>
      <p className="muted">Shown with a progress bar in the info bar, and celebrated when it's reached.</p>
      <div className="row">
        <input
          className="grow"
          placeholder="e.g. Fund the new cat wing"
          value={goalName}
          onChange={(e) => setGoalName(e.target.value)}
          aria-label="Goal"
        />
        <input
          type="number"
          min={1}
          step={500}
          value={goalTarget || ""}
          placeholder="$"
          onChange={(e) => setGoalTarget(Number(e.target.value))}
          aria-label="Goal amount"
        />
        <button
          type="button"
          disabled={!goalName.trim() || !(goalTarget > 0)}
          onClick={() =>
            void update(
              {
                incentives: [
                  {
                    id: event.incentives[0]?.id ?? id(),
                    name: goalName.trim(),
                    target: goalTarget,
                    active: true,
                    displayNow: false,
                    displayUntilMet: false,
                  },
                  ...event.incentives.slice(1),
                ],
              },
              "your big goal",
            ).catch(() => {})
          }
        >
          {event.incentives.length ? "Update goal" : "Add goal"}
        </button>
      </div>
    </Question>
  );
}

// --- 6. Extras -------------------------------------------------------------------

function ExtrasStep({ event, update }: { event: FundraiserEvent; update: Update }) {
  const [cta, setCta] = useState(event.callToAction);
  const [announcements, setAnnouncements] = useState(event.announcements.join("\n"));
  useAutosave(cta, (v) => void update({ callToAction: v.trim() }, "your call to action").catch(() => {}));
  useAutosave(
    announcements,
    (v) =>
      void update(
        {
          announcements: v
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 20),
        },
        "your announcements",
      ).catch(() => {}),
  );
  return (
    <Question title="Anything to tell the room?" lead="Both are optional, and both can change during the show.">
      <label className="field">
        <span>How to give</span>
        <input
          maxLength={160}
          placeholder="e.g. Scan the code on your table to bid or give"
          value={cta}
          onChange={(e) => setCta(e.target.value)}
        />
        <span className="muted">Shows in the info bar between items.</span>
      </label>
      <label className="field">
        <span>Announcements, one per line</span>
        <textarea
          rows={4}
          placeholder={"Dessert auction opens at 8:00\nThank you to our volunteers"}
          value={announcements}
          onChange={(e) => setAnnouncements(e.target.value)}
        />
      </label>
      <p className="muted">Sponsors, prizes and bid wars are on the Event tab, under Show content.</p>
    </Question>
  );
}

// --- 7. Ready --------------------------------------------------------------------

function ReadyStep(props: {
  event: FundraiserEvent;
  events: FundraiserEvent[];
  activeId: string | null;
  onFail: (err: unknown) => void;
  announce: (text: string) => void;
}) {
  const { event } = props;
  const results = useReplicant<SourceResultsReplicant>("sourceResults") ?? {};
  const screens = useReplicant<ScreensReplicant>("screens") ?? [];
  const outputs = useReplicant<OutputsReplicant>("outputs") ?? [];
  const [live, setLive] = useState(props.activeId === event.id);
  const [burst, setBurst] = useState(false);
  const presence = screenPresence(screens, outputs, Date.now());
  const connected = presence.named.filter((n) => n.connected).length + presence.unnamed.length;
  const other = props.events.find((e) => e.id === props.activeId && e.id !== event.id);
  const auction = event.source.adapterId === "32auctions";
  const fetched = results[event.id];

  const checks: [boolean, string, string][] = [
    [
      Boolean(event.name.trim()),
      "Name and cause",
      event.causeName ? `${event.name}, for ${event.causeName}` : event.name,
    ],
    [
      Boolean(event.endDateTime),
      "Closing time",
      event.endDateTime
        ? new Date(event.endDateTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
        : "Not set: the countdown stays blank",
    ],
    [
      validateTheme(event.theme).length === 0,
      "Look",
      event.theme.logoUrl ? "Your logo and colors" : "Colors set; no logo",
    ],
    [
      event.milestones.length > 0,
      "Celebrations",
      event.milestones.length ? `${event.milestones.length} along the way` : "None yet",
    ],
    [
      !auction || Boolean(fetched),
      "Money",
      auction
        ? fetched
          ? `${fetched.items.length} items from 32auctions`
          : "Not checked yet: use Connect and check on the Money step"
        : "Added by hand in the Live tab",
    ],
    [connected > 0, "TVs", connected ? `${connected} connected` : "None open yet. See the Screens tab."],
  ];

  const goLive = async () => {
    try {
      await send("activateEvent", { eventId: event.id });
      await send("switchScene", { id: "main" });
      setLive(true);
      setBurst(true);
      props.announce("!It's live on the TVs.");
      setTimeout(() => setBurst(false), 6000);
    } catch (err) {
      props.onFail(err);
    }
  };

  return (
    <Question
      title={live ? "You're live" : "Ready when you are"}
      lead={
        live
          ? "Run the show from the Live tab: switch scenes, add cash, run Ask Me."
          : "Here's what's set. Anything marked can wait; you can change it all later."
      }
    >
      <ul className="checks">
        {checks.map(([ok, label, detail]) => (
          <li key={label} data-ok={ok || undefined}>
            <span className="checks__mark" aria-hidden="true">
              {ok ? "✓" : "–"}
            </span>
            <strong>{label}</strong>
            <span className="muted">{detail}</span>
          </li>
        ))}
      </ul>
      {live ? (
        <button type="button" className="primary big-button" onClick={() => goTo("fullbleed/live")}>
          Open the Live tab
        </button>
      ) : other ? (
        <ConfirmButton
          className="primary big-button"
          label="Put it on the TVs"
          confirmLabel={`Tap again: this replaces ${other.name}`}
          onConfirm={() => void goLive()}
        />
      ) : (
        <button type="button" className="primary big-button" onClick={() => void goLive()}>
          Put it on the TVs
        </button>
      )}
      <div className="burst" aria-hidden="true">
        <ConfettiBurst active={burst} particleCount={160} />
      </div>
    </Question>
  );
}

createRoot(document.getElementById("root")!).render(<Setup />);
