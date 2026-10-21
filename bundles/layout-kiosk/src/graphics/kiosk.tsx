import { createRoot } from "react-dom/client";
import { LayoutRenderer, contentScale, type Slot } from "@32dashboards/layout-engine";
import { useEffect, useMemo, useState } from "react";
import { newId, useReplicant } from "@32dashboards/nodecg-react";
import {
  EventThemeSchema,
  ScreenIdSchema,
  ScreenViewSchema,
  ThemeSchema,
  type LiveStateReplicant,
  type SceneReplicant,
  type ScreensReplicant,
} from "@32dashboards/schema/core";
import { ThemeProvider } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import "@32dashboards/ui/fonts.css";
import { kioskCatalog } from "../catalog.js";
import { resolveLayout, resolvePreview, type LayoutsReplicant } from "../library.js";
import { PREVIEW_THEME_MESSAGE } from "../preview.js";
import { sampleLive, type SampleKind } from "../samples.js";
import { kioskRegistry } from "../registry.js";
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
 */
const preview = isPreview
  ? {
      layout: params.get("layout"),
      draft: params.has("draft"),
      view: ScreenViewSchema.safeParse(params.get("view")).data ?? null,
      sample: (["demo", "worst"] as const).find((k) => k === params.get("sample")) ?? null,
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

/** Bigger blocks get bigger text: scale each slot's content from its component's reference size. */
function slotScale(slot: Slot, size: { width: number; height: number }): number {
  const entry = kioskCatalog[slot.component];
  if (!entry) return 1;
  const variant = slot.variant ?? Object.keys(entry.variants)[0]!;
  return contentScale(entry.variants[variant], size);
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
    const beat = () => void nodecg.sendMessageToBundle("outputHeartbeat", CORE, { instanceId, output: "kiosk", screenId }).catch(() => {});
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);
}

/** The venue TV: renders this screen's layout for the current scene and the event on screen. */
function Kiosk() {
  const realLive = useReplicant<LiveStateReplicant>("liveState", CORE);
  const realScene = useReplicant<SceneReplicant>("scene", CORE);
  const screens = useReplicant<ScreensReplicant>("screens", CORE);
  const saved = useReplicant<LayoutsReplicant>("layouts");
  const live = useMemo(() => realLive && withSample(realLive, preview?.sample), [realLive]);
  const scene = useMemo<SceneReplicant | undefined>(() => {
    const forced = preview?.view && preview.view !== "standby" ? preview.view : null;
    if (!realScene || !forced || forced === realScene.id) return realScene;
    return { ...realScene, id: forced, message: realScene.message ?? "Back in a few minutes", countdownTo: realScene.countdownTo };
  }, [realScene]);
  const previewTheme = usePreviewTheme();
  const { display, celebrate } = useInfoBar(live);
  const toasts = useDonationMoments(live?.event?.id ?? null, celebrate);
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

  if (!live || !scene) return null;

  return (
    <ThemeProvider theme={previewTheme ?? live.event?.theme ?? DEFAULT_THEME}>
      <LayoutRenderer
        layout={layout}
        registry={kioskRegistry}
        data={{ live, scene, infoBar: display, toasts }}
        slotScale={slotScale}
      />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
