import { createRoot } from "react-dom/client";
import { useReplicant } from "@32dashboards/nodecg-react";
import { TotalRaisedCounter } from "@32dashboards/ui";
import type { LiveStateReplicant } from "@32dashboards/schema/core";
import "@32dashboards/ui/tokens.css";
import "./kiosk.css";

function Kiosk() {
  // Cross-bundle read: the layout owns no state, it renders fundraiser-core's.
  const live = useReplicant<LiveStateReplicant>("liveState", "fundraiser-core");

  return (
    <main className="kiosk">
      <TotalRaisedCounter total={live?.total ?? 0} causeName={live?.event?.causeName || live?.event?.name || ""} />
      <p className="kiosk__meta">
        {live?.observedAt ? `updated ${new Date(live.observedAt).toLocaleTimeString()}` : "waiting for data…"}
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
