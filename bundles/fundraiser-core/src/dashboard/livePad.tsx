import { useState } from "react";
import { ConfirmButton } from "@32dashboards/nodecg-react";
import { liveProgress, liveRaised, lotFinished, type FundraiserEvent, type LiveLot } from "@32dashboards/schema/core";
import { formatExact } from "@32dashboards/ui";
import { parseAmount } from "./amount.js";
import { AmountForm } from "./amountForm.js";
import type { Act } from "./console.js";
import { send } from "./send.js";

const STEPS = [25, 50, 100, 250, 500, 1000];

/** Keeping up with the bidding: tap an increment once, then the big button for each bid after. */
function BidControls({ event, lot, act }: { event: FundraiserEvent; lot: LiveLot; act: Act }) {
  const [step, setStep] = useState(100);
  const raise = (delta: number) => {
    setStep(delta);
    act(
      send("nudgeLiveBid", { eventId: event.id, lotId: lot.id, delta }),
      `Bid up ${formatExact(delta)}.`,
      () => send("nudgeLiveBid", { eventId: event.id, lotId: lot.id, delta: -delta }),
      "live",
    );
  };
  const set = (amount: number) => {
    const previous = lot.currentBid;
    act(
      send("setLiveBid", { eventId: event.id, lotId: lot.id, amount }),
      `Bid set to ${formatExact(amount)}.`,
      () => send("setLiveBid", { eventId: event.id, lotId: lot.id, amount: previous }),
      "live",
    );
  };
  return (
    <>
      <span className="askme__total num">
        {lot.currentBid !== null
          ? formatExact(lot.currentBid)
          : lot.startingBid !== null
            ? `Starts at ${formatExact(lot.startingBid)}`
            : "$0"}
      </span>
      {lot.currentBid === null && lot.startingBid !== null && (
        <button type="button" className="primary live-pad__open" onClick={() => set(lot.startingBid!)}>
          Open at {formatExact(lot.startingBid)}
        </button>
      )}
      <button type="button" className="live-pad__raise" onClick={() => raise(step)}>
        +{formatExact(step)}
      </button>
      <div className="chips" role="group" aria-label="Bid increment">
        {STEPS.map((delta) => (
          <button key={delta} type="button" className="chip" aria-pressed={delta === step} onClick={() => raise(delta)}>
            +{formatExact(delta)}
          </button>
        ))}
      </div>
      <AmountForm label="Set the bid" addLabel="Set" onAdd={set} />
    </>
  );
}

/** Selling the item up now: the price, from the bid or typed in, and an optional paddle number. */
function SoldControls({ event, lot, act }: { event: FundraiserEvent; lot: LiveLot; act: Act }) {
  const [price, setPrice] = useState("");
  const [paddle, setPaddle] = useState("");
  const amount = price.trim() ? parseAmount(price) : event.liveShowBid ? lot.currentBid : null;
  const title = lot.title || "this item";
  const reopen = () => send("reopenLiveLot", { eventId: event.id, lotId: lot.id });
  return (
    <section className="live-pad__sold" aria-label="Sold">
      <div className="row">
        <input
          className="grow"
          inputMode="decimal"
          aria-label="Final price"
          placeholder={
            event.liveShowBid && lot.currentBid !== null ? `Final price: ${formatExact(lot.currentBid)}` : "Final price"
          }
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="live-pad__paddle"
          aria-label="Paddle number (optional)"
          placeholder="Paddle"
          maxLength={20}
          value={paddle}
          onChange={(e) => setPaddle(e.target.value)}
        />
      </div>
      <ConfirmButton
        className="primary live-pad__sell"
        disabled={amount === null || amount <= 0}
        label={amount ? `SOLD for ${formatExact(amount)}` : "Enter the final price"}
        confirmLabel={`Tap again: SOLD for ${formatExact(amount ?? 0)}`}
        onConfirm={() =>
          act(
            send("sellLiveLot", {
              eventId: event.id,
              lotId: lot.id,
              amount: amount!,
              paddle: paddle.trim() || undefined,
            }),
            `Sold ${title} for ${formatExact(amount!)}.`,
            reopen,
            "live",
          )
        }
      />
      <ConfirmButton
        label="No sale, next item"
        confirmLabel="Tap again: no sale"
        onConfirm={() =>
          act(send("passLiveLot", { eventId: event.id, lotId: lot.id }), `No sale: ${title}.`, reopen, "live")
        }
      />
    </section>
  );
}

/** Running the live auction: the item up now, its bid if you're keeping up with it, and SOLD. */
export function LivePad({ event, onAir, act }: { event: FundraiserEvent; onAir: boolean; act: Act }) {
  const progress = liveProgress(event);
  const raised = liveRaised(event);
  const { lot } = progress;

  const liveInTotal = (on: boolean) =>
    act(
      send("updateEvent", { eventId: event.id, patch: { liveInTotal: on } }),
      on ? `Added the live auction's ${formatExact(raised)} to the total.` : "Took the live auction out of the total.",
    );

  return (
    <section className="block askme" aria-label="Live auction">
      <div className="askme__head">
        <h2>
          {progress.count
            ? `Live item ${Math.min(progress.number, progress.count)} of ${progress.count}`
            : "Live auction"}
          {lot && <span className="askme__title"> · {lot.title || `Live item ${progress.number}`}</span>}
        </h2>
        {onAir ? (
          <span className="badge">On TV</span>
        ) : (
          <button
            type="button"
            onClick={() => act(send("switchScene", { id: "liveAuction" }), "Live auction is on the TV.")}
          >
            Put on the TV
          </button>
        )}
      </div>

      {progress.count === 0 && (
        <p className="muted">
          No items yet, so the TVs show a Live auction title. Add items on the Event tab, under Show content, Live
          auction.
        </p>
      )}
      {progress.done && <p className="muted">Every item has had its turn. The TVs say thank you.</p>}

      {/* key: a new item starts with a clean slate */}
      {lot && event.liveShowBid && <BidControls key={`bid-${lot.id}`} event={event} lot={lot} act={act} />}
      {lot && <SoldControls key={`sold-${lot.id}`} event={event} lot={lot} act={act} />}

      {progress.count > 0 && (
        <ol className="askme__plan" aria-label="Tonight's live items">
          {event.liveLots.map((planned, i) => (
            <li key={planned.id} data-state={lotFinished(planned) ? "done" : i === event.liveCurrent ? "now" : "later"}>
              <span className="clamp-1">{planned.title || `Live item ${i + 1}`}</span>
              <span className="num">
                {planned.soldFor !== null
                  ? `${formatExact(planned.soldFor)}${planned.paddle ? ` · #${planned.paddle}` : ""}`
                  : planned.passed
                    ? "no sale"
                    : i === event.liveCurrent
                      ? "now"
                      : ""}
              </span>
            </li>
          ))}
        </ol>
      )}

      <label className="row toggle">
        <input
          type="checkbox"
          checked={event.liveShowBid}
          onChange={(e) =>
            act(
              send("updateEvent", { eventId: event.id, patch: { liveShowBid: e.target.checked } }),
              e.target.checked ? "The TVs show the running bid." : "The TVs show the item alone.",
            )
          }
        />
        <span>
          Show bids on the TV
          <br />
          <span className="muted">Off if nobody's keeping up with the bidding: you just enter the price at SOLD.</span>
        </span>
      </label>

      <p className="muted">
        Live auction so far: {formatExact(raised)},{" "}
        {event.liveInTotal ? "added to the total on the TVs." : "not added to the total on the TVs."}
      </p>
      <ConfirmButton
        label={event.liveInTotal ? "Take it out of the total" : "Add it to the total"}
        confirmLabel={
          event.liveInTotal
            ? "Tap again: the total on the TVs goes down"
            : `Tap again: add ${formatExact(raised)} to the total`
        }
        onConfirm={() => liveInTotal(!event.liveInTotal)}
      />
      <p className="muted">
        Leave it out if these sales also go into 32auctions, so they aren't counted twice. You can change this any time.
      </p>
    </section>
  );
}
