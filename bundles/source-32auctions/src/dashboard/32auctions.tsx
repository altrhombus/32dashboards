import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EventPicker,
  SourceLog,
  SourceStatusLine,
  errorText,
  useReplicant,
  useSourceEvents,
} from "@32dashboards/nodecg-react";
import "@32dashboards/nodecg-react/panel.css";
import { SECRET_KEYS, SOURCE_ID, type Config, type SecretKey } from "../config.js";

const SECRET_LABELS: Record<SecretKey, string> = {
  sessionCookie: "Session cookie (_session_id)",
  authToken: "Auth token (auth_token)",
};

type Draft = Record<keyof Config, string>;
const EMPTY: Draft = { orgId: "", auctionId: "", friendlyAuctionPath: "", refreshIntervalSeconds: "10" };

const toDraft = (config: Config | undefined): Draft =>
  config ? { ...config, refreshIntervalSeconds: String(config.refreshIntervalSeconds) } : EMPTY;

function Panel() {
  const { loaded, events, selected, activeId, select } = useSourceEvents(SOURCE_ID);
  const configs = useReplicant<Record<string, Config>>("configs");
  const secretStatus = useReplicant<Record<string, string[]>>("secretStatus") ?? {};
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [secretDrafts, setSecretDrafts] = useState<Partial<Record<SecretKey, string>>>({});
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const eventId = selected?.id ?? null;
  const saved = eventId ? configs?.[eventId] : undefined;
  const savedJson = JSON.stringify(saved ?? null);
  // Reload the form when switching events or when the saved config changes elsewhere.
  useEffect(() => {
    setDraft(toDraft(saved));
    setSecretDrafts({});
  }, [eventId, savedJson]);

  if (!loaded) return <p className="panel">Waiting for state…</p>;

  const run = (promise: Promise<unknown>, done: string) => {
    setMessage(null);
    promise.then(
      () => setMessage({ error: false, text: done }),
      (err) => setMessage({ error: true, text: errorText(err) }),
    );
  };

  const field = (key: keyof Draft, label: string, hint?: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      {hint && <span className="muted">{hint}</span>}
    </label>
  );

  const keysSet = eventId ? (secretStatus[eventId] ?? []) : [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  return (
    <div className="panel">
      <SourceStatusLine sourceId={SOURCE_ID} />
      <EventPicker events={events} selected={selected} activeId={activeId} onSelect={select} sourceLabel="32auctions" />

      {eventId && (
        <>
          <form
            className="panel"
            style={{ padding: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const config = { ...draft, refreshIntervalSeconds: Number(draft.refreshIntervalSeconds) };
              run(nodecg.sendMessage("setConfig", { eventId, config }), "Settings saved.");
            }}
          >
            {field("orgId", "Organization ID", "From the admin URL: /organizations/<this>/auctions/…")}
            {field("auctionId", "Auction ID", "From the admin URL: …/auctions/<this>")}
            {field(
              "friendlyAuctionPath",
              "Public auction path",
              "32auctions.com/<this>, where the total raised is shown",
            )}
            {field("refreshIntervalSeconds", "Refresh every (seconds)")}
            <div className="row">
              <button type="submit" disabled={!dirty}>
                Save settings
              </button>
              <button
                type="button"
                onClick={() =>
                  run(nodecg.sendMessageToBundle("refreshSource", "fundraiser-core", { eventId }), "Refresh requested.")
                }
              >
                Refresh now
              </button>
            </div>
          </form>

          <div className="panel" style={{ padding: 0 }}>
            <div className="muted">
              Only needed for private auctions. Values are stored on the server and never shown again.
            </div>
            {SECRET_KEYS.map((key) => (
              <label key={key} className="field">
                <span>
                  {SECRET_LABELS[key]}{" "}
                  {keysSet.includes(key) ? <span className="badge">set</span> : <span className="muted">not set</span>}
                </span>
                <span className="row">
                  <input
                    type="password"
                    autoComplete="off"
                    value={secretDrafts[key] ?? ""}
                    onChange={(e) => setSecretDrafts({ ...secretDrafts, [key]: e.target.value })}
                  />
                  <button
                    type="button"
                    disabled={!secretDrafts[key]}
                    onClick={() => {
                      run(nodecg.sendMessage("setSecret", { eventId, key, value: secretDrafts[key] }), "Saved.");
                      setSecretDrafts({ ...secretDrafts, [key]: "" });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={!keysSet.includes(key)}
                    onClick={() => run(nodecg.sendMessage("setSecret", { eventId, key, value: null }), "Cleared.")}
                  >
                    Clear
                  </button>
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {message && <p className={message.error ? "error" : "muted"}>{message.text}</p>}
      <SourceLog sourceId={SOURCE_ID} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
