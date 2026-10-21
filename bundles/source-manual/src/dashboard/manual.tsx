import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EventPicker, SourceLog, errorText, useReplicant, useSourceEvents } from "@32dashboards/nodecg-react";
import { formatCurrency, type SourceItem } from "@32dashboards/schema/core";
import "@32dashboards/nodecg-react/panel.css";
import { SOURCE_ID, type EntriesReplicant, type ManualMessageName, type ManualMessagePayload } from "../model.js";

const send = <N extends ManualMessageName>(name: N, payload: ManualMessagePayload<N>) =>
  nodecg.sendMessage(name, payload);

/** Parses an optional money/count field: "" -> null, otherwise a number (NaN if invalid). */
const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

function Panel() {
  const { loaded, events, selected, activeId, select } = useSourceEvents(SOURCE_ID);
  const entries = useReplicant<EntriesReplicant>("entries");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!loaded || !entries) return <p className="panel">Waiting for state…</p>;

  const run = (promise: Promise<unknown>) => {
    setError(null);
    return promise.catch((err) => {
      setError(errorText(err));
      throw err;
    });
  };

  const eventId = selected?.id;
  const entry = eventId ? entries[eventId] : undefined;
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;

  return (
    <div className="panel">
      <EventPicker
        events={events}
        selected={selected}
        activeId={activeId}
        onSelect={select}
        sourceLabel="manual entry"
      />
      {eventId && (
        <>
          <div className="total">{formatCurrency(entry?.total ?? 0)}</div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && value > 0)
                run(send("addDonation", { eventId, amount: value })).then(
                  () => setAmount(""),
                  () => {},
                );
            }}
          >
            <input
              inputMode="decimal"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button type="submit" disabled={!valid || value === 0}>
              Add donation
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() =>
                run(send("setTotal", { eventId, total: value })).then(
                  () => setAmount(""),
                  () => {},
                )
              }
            >
              Set total
            </button>
          </form>

          <h4 style={{ margin: 0 }}>Items</h4>
          {(entry?.items ?? []).map((item) => (
            <ItemRow key={item.id} eventId={eventId} item={item} run={run} />
          ))}
          <ItemRow eventId={eventId} run={run} />
        </>
      )}
      {error && <p className="error">{error}</p>}
      <SourceLog sourceId={SOURCE_ID} limit={10} />
    </div>
  );
}

/** Edits one item, or adds a new one when `item` is omitted. */
function ItemRow(props: { eventId: string; item?: SourceItem; run: (p: Promise<unknown>) => Promise<unknown> }) {
  const { eventId, item, run } = props;
  const [title, setTitle] = useState(item?.title ?? "");
  const [bid, setBid] = useState(item?.currentBid?.toString() ?? "");
  const [bids, setBids] = useState(item?.bidCount?.toString() ?? "");

  const currentBid = optionalNumber(bid);
  const bidCount = optionalNumber(bids);
  const valid =
    title.trim() !== "" &&
    (currentBid === null || (Number.isFinite(currentBid) && currentBid >= 0)) &&
    (bidCount === null || (Number.isInteger(bidCount) && bidCount >= 0));
  const dirty = !item || title !== item.title || currentBid !== item.currentBid || bidCount !== item.bidCount;

  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const payload = { ...item, id: item?.id, title: title.trim(), currentBid, bidCount };
        run(send("upsertItem", { eventId, item: payload })).then(
          () => {
            if (!item) {
              setTitle("");
              setBid("");
              setBids("");
            }
          },
          () => {},
        );
      }}
    >
      <input placeholder={item ? "Title" : "New item title"} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input
        style={{ width: 80 }}
        inputMode="decimal"
        placeholder="Bid"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
      />
      <input
        style={{ width: 56 }}
        inputMode="numeric"
        placeholder="Bids"
        value={bids}
        onChange={(e) => setBids(e.target.value)}
      />
      <button type="submit" disabled={!valid || !dirty}>
        {item ? "Save" : "Add"}
      </button>
      {item && (
        <button type="button" onClick={() => run(send("removeItem", { eventId, itemId: item.id })).catch(() => {})}>
          Remove
        </button>
      )}
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
