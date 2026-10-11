import { createRoot } from "react-dom/client";
import { LayoutRenderer } from "@32dashboards/layout-engine";
import { useReplicant } from "@32dashboards/nodecg-react";
import { ThemeSchema, type LiveStateReplicant, type SceneReplicant } from "@32dashboards/schema/core";
import { ThemeProvider } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import { kioskLayouts } from "../layouts.js";
import { kioskRegistry } from "../registry.js";
import { useDonationMoments, useInfoBar } from "../useShow.js";
import "./kiosk.css";

const CORE = "fundraiser-core";
const DEFAULT_THEME = ThemeSchema.parse({});

/** The venue TV: renders the current scene's layout for the event on screen. */
function Kiosk() {
  const live = useReplicant<LiveStateReplicant>("liveState", CORE);
  const scene = useReplicant<SceneReplicant>("scene", CORE);
  const { display, celebrate } = useInfoBar(live);
  const toasts = useDonationMoments(live?.event?.id ?? null, celebrate);

  if (!live || !scene) return null;
  const layout = live.event ? kioskLayouts[scene.id] : kioskLayouts.standby;

  return (
    <ThemeProvider theme={live.event?.theme ?? DEFAULT_THEME}>
      <LayoutRenderer layout={layout} registry={kioskRegistry} data={{ live, scene, infoBar: display, toasts }} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
