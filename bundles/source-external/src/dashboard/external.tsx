import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SourceLog, SourceStatusLine, errorText, useReplicant, useSourceEvents } from "@32dashboards/nodecg-react";
import "@32dashboards/nodecg-react/panel.css";
import { SOURCE_ID, type EndpointReplicant } from "../model.js";

function Panel() {
  const endpoint = useReplicant<EndpointReplicant>("endpoint");
  const { events } = useSourceEvents(SOURCE_ID);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!endpoint) return <p className="panel">Waiting for state…</p>;

  // The dashboard's own address is how other machines on the network reach this server.
  const url = `${window.location.origin}${endpoint.path}`;
  const example = `curl -X POST ${url} \\
  -H "Authorization: Bearer ${token ?? "<token>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"eventId": "${events[0]?.id ?? "<event id>"}", "total": 1234.5, "items": []}'`;

  const rotate = () => {
    if (endpoint.tokenCreatedAt && !window.confirm("Replace the token? Anything using the old one will stop working.")) {
      return;
    }
    setError(null);
    nodecg.sendMessage("rotateToken").then(
      (value) => setToken(value as string),
      (err) => setError(errorText(err)),
    );
  };

  return (
    <div className="panel">
      <SourceStatusLine sourceId={SOURCE_ID} />
      <div>
        <div className="muted">Endpoint</div>
        <code>POST {url}</code>
      </div>

      <div>
        <div className="muted">Events using this source (push to their id)</div>
        {events.length === 0 && <p className="muted">None yet. Pick "External push" as an event's source.</p>}
        {events.map((event) => (
          <div key={event.id}>
            {event.name}: <code>{event.id}</code>
          </div>
        ))}
      </div>

      <div className="row">
        <span>
          Token:{" "}
          {endpoint.tokenCreatedAt ? `created ${new Date(endpoint.tokenCreatedAt).toLocaleString()}` : "none (pushes are refused)"}
        </span>
        <button type="button" onClick={rotate}>
          {endpoint.tokenCreatedAt ? "Replace token" : "Create token"}
        </button>
        {endpoint.tokenCreatedAt && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Revoke the token? Pushes will be refused until you create a new one.")) return;
              setToken(null);
              nodecg.sendMessage("revokeToken").catch((err) => setError(errorText(err)));
            }}
          >
            Revoke
          </button>
        )}
      </div>
      {token && (
        <p>
          New token, shown only now. Copy it to the pushing process: <code style={{ wordBreak: "break-all" }}>{token}</code>
        </p>
      )}
      {endpoint.lastPushAt && <p className="muted">Last accepted push {new Date(endpoint.lastPushAt).toLocaleString()}</p>}

      <pre className="log">{example}</pre>
      {error && <p className="error">{error}</p>}
      <SourceLog sourceId={SOURCE_ID} limit={10} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
