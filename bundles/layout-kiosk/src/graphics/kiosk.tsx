import { createRoot } from "react-dom/client";
import { LayoutRenderer } from "@32dashboards/layout-engine";
import { useEffect, useMemo } from "react";
import { newId, useReplicant } from "@32dashboards/nodecg-react";
import {
  ScreenIdSchema,
  ThemeSchema,
  type LiveStateReplicant,
  type SceneReplicant,
  type ScreensReplicant,
} from "@32dashboards/schema/core";
import { ThemeProvider } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import { resolveLayout, type LayoutsReplicant } from "../library.js";
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
  const live = useReplicant<LiveStateReplicant>("liveState", CORE);
  const scene = useReplicant<SceneReplicant>("scene", CORE);
  const screens = useReplicant<ScreensReplicant>("screens", CORE);
  const saved = useReplicant<LayoutsReplicant>("layouts");
  const { display, celebrate } = useInfoBar(live);
  const toasts = useDonationMoments(live?.event?.id ?? null, celebrate);
  useHeartbeat();

  const view = live?.event ? (scene?.id ?? "main") : "standby";
  const screen = screens?.find((s) => s.id === screenId);
  const { layout, problem } = useMemo(() => resolveLayout(view, screen, saved ?? []), [view, screen, saved]);
  useEffect(() => {
    if (problem) console.error(`Showing the built-in ${view} layout instead: ${problem}`);
  }, [problem, view]);

  if (!live || !scene) return null;

  return (
    <ThemeProvider theme={live.event?.theme ?? DEFAULT_THEME}>
      <LayoutRenderer layout={layout} registry={kioskRegistry} data={{ live, scene, infoBar: display, toasts }} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
