import { createRoot } from "react-dom/client";
import { useReplicant } from "@32dashboards/nodecg-react";
import type { SpikeTotal } from "../schemas/index.js";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function SpikeControl() {
  const state = useReplicant<SpikeTotal>("spikeTotal");
  if (!state) return <p>Waiting for state…</p>;

  const adjust = (amount: number) => {
    void nodecg.sendMessage("adjust", amount);
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontVariantNumeric: "tabular-nums" }}>
      <p>Source: {state.sourceId ?? "none yet"}</p>
      <p>
        Raw {usd.format(state.rawTotal)} + adjustment {usd.format(state.adjustment)} ={" "}
        <strong>{usd.format(state.total)}</strong>
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {[-100, -10, 10, 100].map((amount) => (
          <button key={amount} type="button" onClick={() => adjust(amount)}>
            {amount > 0 ? `+${amount}` : amount}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<SpikeControl />);
