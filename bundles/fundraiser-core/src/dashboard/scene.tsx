import { useState } from "react";
import { createRoot } from "react-dom/client";
import { errorText, useReplicant } from "@32dashboards/nodecg-react";
import type { SceneId, SceneReplicant } from "@32dashboards/schema/core";
import "@32dashboards/nodecg-react/panel.css";
import { send } from "./send.js";

const SCENES: { id: SceneId; label: string; hint: string }[] = [
  { id: "main", label: "Main", hint: "Total, featured items, info bar" },
  { id: "intermission", label: "Intermission", hint: "Message and countdown, total stays up" },
  { id: "askMe", label: "Ask Me", hint: "Full-screen Ask Me spotlight" },
  { id: "celebration", label: "Celebration", hint: "Thank-you screen with the final total" },
];

function ScenePanel() {
  const scene = useReplicant<SceneReplicant>("scene");
  const [minutes, setMinutes] = useState("15");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!scene) return <p className="panel">Waiting for state…</p>;

  const switchTo = (id: SceneId) => {
    setError(null);
    const mins = Number(minutes);
    const payload =
      id === "intermission"
        ? {
            id,
            countdownTo: Number.isFinite(mins) && mins > 0 ? new Date(Date.now() + mins * 60_000).toISOString() : null,
            message: message.trim() || null,
          }
        : { id };
    send("switchScene", payload).catch((err) => setError(errorText(err)));
  };

  return (
    <div className="panel">
      <div className="muted">
        On screen: <strong>{SCENES.find((s) => s.id === scene.id)?.label}</strong> since{" "}
        {new Date(scene.changedAt).toLocaleTimeString()}
      </div>
      <div className="scene-grid">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scene-button${s.id === scene.id ? " scene-button--active" : ""}`}
            onClick={() => switchTo(s.id)}
            title={s.hint}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Intermission message</span>
        <input value={message} maxLength={160} placeholder="We'll be right back" onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="field">
        <span>Intermission countdown (minutes, blank for none)</span>
        <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ScenePanel />);
