import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useReplicant } from "@32dashboards/nodecg-react";
import { formatCurrency, type LiveStateReplicant } from "@32dashboards/schema/core";
import { errorText, send } from "./send.js";
import "./panel.css";

const NUDGES = [-100, -10, 10, 100];

function LiveTotal() {
  const live = useReplicant<LiveStateReplicant>("liveState");
  const [error, setError] = useState<string | null>(null);
  const [exact, setExact] = useState("");
  const [filters, setFilters] = useState("");

  const event = live?.event ?? null;
  const savedFilters = event?.filters.join("\n") ?? "";
  // Reload the editor when the operator switches events or filters change elsewhere.
  useEffect(() => setFilters(savedFilters), [event?.id, savedFilters]);

  if (!live) return <p className="panel">Waiting for state…</p>;
  if (!event) return <p className="panel">No event is active. Activate one in the Events panel.</p>;

  const run = (promise: Promise<unknown>) => {
    setError(null);
    promise.catch((err) => setError(errorText(err)));
  };

  const amount = Number(exact);
  const exactValid = exact.trim() !== "" && Number.isFinite(amount);

  return (
    <div className="panel">
      <div>
        <div className="muted">{event.name}</div>
        <div className="total">{formatCurrency(Math.round(live.total))}</div>
        <div className="muted">
          Source {formatCurrency(live.rawTotal)} + adjustment {formatCurrency(live.adjustment)}
          {live.observedAt && ` · updated ${new Date(live.observedAt).toLocaleTimeString()}`}
        </div>
      </div>

      <div className="row">
        {NUDGES.map((delta) => (
          <button key={delta} type="button" onClick={() => run(send("nudgeAdjustment", { eventId: event.id, delta }))}>
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!exactValid) return;
          run(send("setAdjustment", { eventId: event.id, amount }));
          setExact("");
        }}
      >
        <input
          inputMode="decimal"
          placeholder="Set adjustment to…"
          value={exact}
          onChange={(e) => setExact(e.target.value)}
          aria-label="Adjustment amount"
        />
        <button type="submit" disabled={!exactValid}>
          Set
        </button>
      </form>

      <label>
        <div>Hide items whose title contains (one per line)</div>
        <textarea rows={4} value={filters} onChange={(e) => setFilters(e.target.value)} />
      </label>
      <div className="row">
        <button
          type="button"
          disabled={filters === savedFilters}
          onClick={() => run(send("setFilters", { eventId: event.id, filters: filters.split("\n") }))}
        >
          Save filters
        </button>
        <span className="muted">
          {live.items.length} shown, {live.hiddenItemCount} hidden
        </span>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<LiveTotal />);
