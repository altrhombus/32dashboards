import { createRoot } from "react-dom/client";
import { LayoutRenderer, contentScale, type Slot } from "@32dashboards/layout-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newId, useReplicant } from "@32dashboards/nodecg-react";
import {
  EventThemeSchema,
  ScreenIdSchema,
  ScreenViewSchema,
  ThemeSchema,
  liveStateFor,
  type EventsReplicant,
  type LiveStateReplicant,
  type MomentsReplicant,
  type SceneReplicant,
  type ScreensReplicant,
  type SourceResultsReplicant,
} from "@32dashboards/schema/core";
import { ThemeProvider } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import "@32dashboards/ui/fonts.css";
import { kioskCatalog } from "../catalog.js";
import { resolveLayout, resolvePreview, type LayoutsReplicant } from "../library.js";
import { PREVIEW_THEME_MESSAGE } from "../preview.js";
import { sampleLive, type SampleKind } from "../samples.js";
import { kioskRegistry } from "../registry.js";
import type { CelebrationMoment } from "../data.js";
import { useDonationMoments, useInfoBar } from "../useShow.js";
import "./kiosk.css";

const CORE = "fundraiser-core";
const DEFAULT_THEME = ThemeSchema.parse({});
const HEARTBEAT_MS = 10_000;

const params = new URLSearchParams(window.location.search);

/** `?preview` marks a copy shown in the dashboard; only the real TV checks in. */
const isPreview = params.has("preview");

/** `?screen=<id>` names the screen this kiosk is, so it shows that screen's layouts. */
const screenId = (() => {
  const raw = params.get("screen");
  if (raw === null) return null;
  const parsed = ScreenIdSchema.safeParse(raw);
  if (!parsed.success) console.warn(`Ignoring ?screen=${raw}: ${parsed.error.issues[0]?.message}`);
  return parsed.success ? parsed.data : null;
})();

/*
 * Preview-only options, for the layout builder (ignored without ?preview, so
 * a TV can never get stuck on a draft or sample data):
 *   layout=<id>        show this layout instead of the screen's
 *   draft              show its unpublished draft, if it has one
 *   view=<scene>       show this scene (or standby) whatever is on air
 *   sample=demo|worst  made-up show data, wearing the on-screen event's look
 *   event=<id>         that event's own content and look, on screen or not (for setting one up)
 *   askMeRound=<n>     show planned Ask Me round n (0-based), e.g. the one being written
 */
const preview = isPreview
  ? {
      layout: params.get("layout"),
      draft: params.has("draft"),
      view: ScreenViewSchema.safeParse(params.get("view")).data ?? null,
      sample: (["demo", "worst"] as const).find((k) => k === params.get("sample")) ?? null,
      event: params.get("event"),
      askMeRound: /^\d+$/.test(params.get("askMeRound") ?? "") ? Number(params.get("askMeRound")) : null,
    }
  : null;

/** In a preview, the look the parent page is trying out (null: the event's own). */
function usePreviewTheme() {
  const [theme, setTheme] = useState<ReturnType<typeof EventThemeSchema.parse> | null>(null);
  useEffect(() => {
    if (!isPreview) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_THEME_MESSAGE) return;
      const parsed = e.data.theme === null ? null : EventThemeSchema.safeParse(e.data.theme);
      setTheme(parsed && parsed.success ? parsed.data : null);
    };
    window.addEventListener("message", onMessage);
    // Ask for the look in case the parent posted it before we were listening.
    window.parent?.postMessage({ type: `${PREVIEW_THEME_MESSAGE}:ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return theme;
}

/**
 * Bigger blocks get bigger text: scale each slot's content from its
 * component's reference size, then by the block's own text size and the
 * screen's (`screenTextSize`), if either is set.
 */
function slotScaleFor(screenTextSize: number) {
  return (slot: Slot, size: { width: number; height: number }): number => {
    const entry = kioskCatalog[slot.component];
    if (!entry) return 1;
    const variant = slot.variant ?? Object.keys(entry.variants)[0]!;
    return Math.round(contentScale(entry.variants[variant], size) * (slot.scale ?? 1) * screenTextSize * 100) / 100;
  };
}

/** Sample data for a preview, wearing the real event's look when one is on screen. */
function withSample(live: LiveStateReplicant, kind: SampleKind | null | undefined): LiveStateReplicant {
  if (!kind) return live;
  const sample = sampleLive(kind);
  return live.event ? { ...sample, event: { ...sample.event!, theme: live.event.theme } } : sample;
}

/** Tells fundraiser-core this kiosk is on screen, so operators can see the TV is live. */
function useHeartbeat() {
  useEffect(() => {
    if (isPreview) return;
    const instanceId = newId();
    const beat = () =>
      void nodecg
        .sendMessageToBundle("outputHeartbeat", CORE, { instanceId, output: "kiosk", screenId })
        .catch(() => {});
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);
}

/** Offline this long before the TV says so; shorter blips pass unnoticed. */
const OFFLINE_NOTICE_MS = 10_000;
/** Back after at least this long offline, the TV reloads, to start fresh (e.g. after a server restart). */
const RELOAD_AFTER_MS = 60_000;

/**
 * A small "Reconnecting…" in the corner while the TV has lost the server,
 * so a volunteer glancing at it knows it's frozen on old numbers. Only on a
 * real TV, not in dashboard previews.
 */
function ConnectionNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (isPreview) return;
    const socket = nodecg.socket;
    let since: number | null = socket.connected ? null : Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lost = () => {
      since ??= Date.now();
      clearTimeout(timer);
      timer = setTimeout(() => setOffline(true), OFFLINE_NOTICE_MS);
    };
    const back = () => {
      clearTimeout(timer);
      setOffline(false);
      if (since !== null && Date.now() - since >= RELOAD_AFTER_MS) location.reload();
      since = null;
    };
    if (since !== null) lost();
    socket.on("disconnect", lost);
    socket.on("connect", back);
    return () => {
      clearTimeout(timer);
      socket.off("disconnect", lost);
      socket.off("connect", back);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="kiosk-offline" role="status">
      <span className="kiosk-offline__dot" aria-hidden="true" />
      Reconnecting…
    </div>
  );
}

/** The venue TV: renders this screen's layout for the current scene and the event on screen. */
function Kiosk() {
  const realLive = useReplicant<LiveStateReplicant>("liveState", CORE);
  const realScene = useReplicant<SceneReplicant>("scene", CORE);
  const screens = useReplicant<ScreensReplicant>("screens", CORE);
  const saved = useReplicant<LayoutsReplicant>("layouts");
  // A preview of one event reads its own content; anything else shows what's on air.
  const events = useReplicant<EventsReplicant>("events", CORE);
  const results = useReplicant<SourceResultsReplicant>("sourceResults", CORE);
  const previewed = preview?.event ? (events?.find((e) => e.id === preview.event) ?? null) : undefined;
  const onAir = useMemo(
    () =>
      previewed !== undefined ? liveStateFor(previewed, previewed ? results?.[previewed.id] : undefined) : realLive,
    [previewed, results, realLive],
  );
  const live = useMemo(() => {
    const shown = onAir && withSample(onAir, preview?.sample);
    const round = preview?.askMeRound;
    return shown && shown.event && round !== null && round !== undefined
      ? { ...shown, event: { ...shown.event, askMeCurrent: round } }
      : shown;
  }, [onAir]);
  const scene = useMemo<SceneReplicant | undefined>(() => {
    const forced = preview?.view && preview.view !== "standby" ? preview.view : null;
    if (!realScene || !forced || forced === realScene.id) return realScene;
    return {
      ...realScene,
      id: forced,
      message: realScene.message ?? "Back in a few minutes",
      countdownTo: realScene.countdownTo,
    };
  }, [realScene]);
  const previewTheme = usePreviewTheme();
  // Moments feed both the toasts and the info bar's latest bids, and celebrations go to the info
  // bar: the two hooks reach each other through refs, set below once the info bar has its say.
  const moments = useReplicant<MomentsReplicant>("moments", CORE);
  const celebrateRef = useRef<(moment: CelebrationMoment) => void>(() => {});
  const relayCelebrate = useCallback((moment: CelebrationMoment) => celebrateRef.current(moment), []);
  const quietRef = useRef(false);
  const { toasts, roundWrap, recent } = useDonationMoments(live?.event?.id ?? null, relayCelebrate, {
    history: moments,
    quiet: quietRef,
  });
  const { display, celebrate } = useInfoBar(live);
  celebrateRef.current = celebrate;
  // While the info bar lists the latest bids, toasts would only repeat it.
  const quiet = display.type === "segment" && display.segment.content.kind === "recent";
  quietRef.current = quiet;
  useHeartbeat();

  const view = preview?.view ?? (live?.event ? (scene?.id ?? "main") : "standby");
  const screen = screens?.find((s) => s.id === screenId);
  const { layout, problem } = useMemo(
    () =>
      preview?.layout
        ? resolvePreview(preview.layout, view, saved ?? [], preview.draft)
        : resolveLayout(view, screen, saved ?? []),
    [view, screen, saved],
  );
  useEffect(() => {
    if (problem) console.error(`Showing the built-in ${view} layout instead: ${problem}`);
  }, [problem, view]);
  const screenTextSize = screen?.textSize ?? 1;
  const slotScale = useMemo(() => slotScaleFor(screenTextSize), [screenTextSize]);

  if (!live || !scene) return <ConnectionNotice />;

  return (
    <ThemeProvider theme={previewTheme ?? live.event?.theme ?? DEFAULT_THEME}>
      {/* Keyed by scene, so each switch fades the new scene in. */}
      <div className="kiosk-scene" key={view}>
        <LayoutRenderer
          layout={layout}
          registry={kioskRegistry}
          data={{ live, scene, infoBar: display, toasts: quiet ? [] : toasts, roundWrap, recent }}
          slotScale={slotScale}
        />
      </div>
      <ConnectionNotice />
    </ThemeProvider>
  );
}

/*
 * On a real TV: double-click toggles full screen (the browser's own, which,
 * unlike F11, shows no toolbar when the mouse reaches the top), and the mouse
 * pointer hides after a few seconds without moving.
 */
if (!isPreview) {
  document.addEventListener("dblclick", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  });
  let idle: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    document.documentElement.classList.remove("pointer-idle");
    clearTimeout(idle);
    idle = setTimeout(() => document.documentElement.classList.add("pointer-idle"), 3000);
  };
  document.addEventListener("mousemove", wake);
  wake();
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
