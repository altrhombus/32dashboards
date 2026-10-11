import { createRoot } from "react-dom/client";
import { LayoutRenderer } from "@32dashboards/layout-engine";
import { useEffect } from "react";
import { newId, useReplicant } from "@32dashboards/nodecg-react";
import { ThemeSchema, type LiveStateReplicant, type SceneReplicant } from "@32dashboards/schema/core";
import { ThemeProvider } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import { kioskLayouts } from "../layouts.js";
import { kioskRegistry } from "../registry.js";
import { useDonationMoments, useInfoBar } from "../useShow.js";
import "./kiosk.css";

const CORE = "fundraiser-core";
const DEFAULT_THEME = ThemeSchema.parse({});
const HEARTBEAT_MS = 10_000;

/** `?preview` marks a copy shown in the dashboard; only the real TV checks in. */
const isPreview = new URLSearchParams(window.location.search).has("preview");

/** Tells fundraiser-core this kiosk is on screen, so operators can see the TV is live. */
function useHeartbeat() {
  useEffect(() => {
    if (isPreview) return;
    const instanceId = newId();
    const beat = () => void nodecg.sendMessageToBundle("outputHeartbeat", CORE, { instanceId, output: "kiosk" }).catch(() => {});
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);
}

/** The venue TV: renders the current scene's layout for the event on screen. */
function Kiosk() {
  const live = useReplicant<LiveStateReplicant>("liveState", CORE);
  const scene = useReplicant<SceneReplicant>("scene", CORE);
  const { display, celebrate } = useInfoBar(live);
  const toasts = useDonationMoments(live?.event?.id ?? null, celebrate);
  useHeartbeat();

  if (!live || !scene) return null;
  const layout = live.event ? kioskLayouts[scene.id] : kioskLayouts.standby;

  return (
    <ThemeProvider theme={live.event?.theme ?? DEFAULT_THEME}>
      <LayoutRenderer layout={layout} registry={kioskRegistry} data={{ live, scene, infoBar: display, toasts }} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
