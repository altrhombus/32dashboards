import { createRoot } from "react-dom/client";
import { useReplicant } from "@32dashboards/nodecg-react";
import { TotalRaisedCounter } from "@32dashboards/ui";
import "@32dashboards/ui/tokens.css";
import type { SpikeTotal } from "spike-core";
import "./kiosk.css";

function Kiosk() {
  // Cross-bundle read: the layout owns no state, it renders spike-core's.
  const state = useReplicant<SpikeTotal>("spikeTotal", "spike-core");

  return (
    <main className="kiosk">
      <TotalRaisedCounter total={state?.total ?? 0} causeName="the spike" />
      <p className="kiosk__meta">
        {state?.observedAt ? `updated ${new Date(state.observedAt).toLocaleTimeString()}` : "waiting for data…"}
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Kiosk />);
